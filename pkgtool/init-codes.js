// scripts/init-codes.js
// 用法：npm run init-codes
// 环境变量：UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//          （或 Vercel 集成注入的 KV_REST_API_URL / KV_REST_API_TOKEN，@upstash/redis 会 fallback）

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const resourceCodes = {
    'design-pack-101': [
        'R20250321ABCDEF',
        'R20250322GHIJKL',
        'R20250323MNOPQR'
    ],
    'ai-model-202': [
        'AIFREE2025XYZ',
        'AIPRO123456'
    ]
};

const downloadUrls = {
    'design-pack-101': 'https://your-cdn.com/design-pack.zip',
    'ai-model-202': 'https://your-cdn.com/ai-model.zip'
};

async function init() {
    console.log('🚀 初始化兑换码到 Upstash Redis...\n');

    for (const [resourceId, codes] of Object.entries(resourceCodes)) {
        const validKey = `valid:${resourceId}`;
        const usedKey = `used:${resourceId}`;

        await redis.del(validKey);
        await redis.del(usedKey);

        if (codes.length > 0) {
            await redis.sadd(validKey, ...codes);
            console.log(`✅ ${validKey}：导入 ${codes.length} 个兑换码`);
        }

        if (downloadUrls[resourceId]) {
            await redis.set(`url:${resourceId}`, downloadUrls[resourceId]);
            console.log(`🔗 url:${resourceId} 已写入`);
        }
        console.log('');
    }

    console.log('🎉 全部完成');
}

init().catch(err => {
    console.error('❌ 初始化失败:', err);
    process.exit(1);
});