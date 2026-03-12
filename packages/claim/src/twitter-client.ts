/**
 * PumpFun Claim Bot — Twitter/X API Client
 *
 * Fetches follower counts and checks if influencers follow a user.
 */

import { log } from './logger.js';
import type { TwitterUserInfo } from './types.js';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const TWITTER_CACHE_TTL = 300_000; // 5 minutes
const twitterCache = new Map<string, CacheEntry<TwitterUserInfo>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
    cache.set(key, { data, expiresAt: Date.now() + ttl });
    if (cache.size > 200) {
        const now = Date.now();
        for (const [k, v] of cache) {
            if (now > v.expiresAt) cache.delete(k);
        }
    }
}

// ============================================================================
// API
// ============================================================================

/**
 * Fetch Twitter user information including follower count and influencer follows.
 * 
 * @param username - Twitter username (without @)
 * @param bearerToken - Twitter API v2 bearer token
 * @param influencerIds - Array of influencer user IDs to check for follows
 * @returns TwitterUserInfo or null if user not found or API error
 */
export async function fetchTwitterUserInfo(
    username: string,
    bearerToken: string,
    influencerIds: string[],
): Promise<TwitterUserInfo | null> {
    const cacheKey = `${username}:${influencerIds.join(',')}`;
    const cached = getCached(twitterCache, cacheKey);
    if (cached) return cached;

    try {
        // Step 1: Get user info by username
        const userResp = await fetch(
            `${TWITTER_API_BASE}/users/by/username/${encodeURIComponent(username)}?user.fields=id,name,username,public_metrics`,
            {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!userResp.ok) {
            if (userResp.status === 404) {
                log.debug('Twitter user @%s not found', username);
                return null;
            }
            if (userResp.status === 401 || userResp.status === 403) {
                log.warn('Twitter API auth error (status %d). Check TWITTER_BEARER_TOKEN.', userResp.status);
                return null;
            }
            if (userResp.status === 429) {
                log.warn('Twitter API rate limit exceeded (429)');
                return null;
            }
            log.warn('Twitter API error %d for user @%s', userResp.status, username);
            return null;
        }

        const userData = (await userResp.json()) as Record<string, unknown>;
        const user = userData.data as Record<string, unknown> | undefined;

        if (!user) {
            log.debug('Twitter user @%s not found in response', username);
            return null;
        }

        const userId = String(user.id ?? '');
        const publicMetrics = user.public_metrics as Record<string, unknown> | undefined;
        const followersCount = Number(publicMetrics?.followers_count ?? 0);

        // Step 2: Check which influencers follow this user (if any)
        const followedByInfluencers: string[] = [];
        
        if (influencerIds.length > 0) {
            // Check each influencer (Twitter API v2 doesn't have batch following check)
            // We'll check if the influencer follows this user
            for (const influencerId of influencerIds) {
                try {
                    const followResp = await fetch(
                        `${TWITTER_API_BASE}/users/${encodeURIComponent(influencerId)}/following/${encodeURIComponent(userId)}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${bearerToken}`,
                                'Accept': 'application/json',
                            },
                            signal: AbortSignal.timeout(5_000),
                        },
                    );

                    // If 200, influencer follows the user
                    if (followResp.ok) {
                        const followData = (await followResp.json()) as Record<string, unknown>;
                        if (followData.data) {
                            followedByInfluencers.push(influencerId);
                        }
                    }
                } catch (err) {
                    log.debug('Failed to check influencer %s follow for @%s: %s', influencerId, username, err);
                    // Continue checking other influencers
                }
            }
        }

        const info: TwitterUserInfo = {
            id: userId,
            username: String(user.username ?? username),
            name: String(user.name ?? username),
            followersCount,
            followedByInfluencers,
        };

        setCache(twitterCache, cacheKey, info, TWITTER_CACHE_TTL);
        return info;
    } catch (err) {
        log.warn('Failed to fetch Twitter info for @%s: %s', username, err);
        return null;
    }
}

/**
 * Format follower count in human-readable format (1.2K, 3.4M, etc.)
 */
export function formatFollowerCount(count: number): string {
    if (count < 1000) return count.toString();
    if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
    if (count < 1_000_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    return `${(count / 1_000_000_000).toFixed(1)}B`;
}
