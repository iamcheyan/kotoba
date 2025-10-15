// Service Worker for Kotoba PWA
const CACHE_NAME = 'kotoba-v1.0.3';

// 核心资源 - 优先缓存
const CORE_RESOURCES = [
    '/',
    '/index.html',
    '/static/app.js',
    '/static/styles.css',
    '/static/config.json',
    '/manifest.json',
    '/static/favicon.svg',
    '/static/icon-192.png'
];

// 字典文件
const DICTIONARY_RESOURCES = [
    '/static/dictionaries/base.json',
    '/static/dictionaries/beginner.json',
    '/static/dictionaries/confusing.json',
    '/static/dictionaries/grammar.json',
    '/static/dictionaries/jlpt_n5.json',
    '/static/dictionaries/jlpt_n4.json',
    '/static/dictionaries/jlpt_n3.json',
    '/static/dictionaries/jlpt_n2.json',
    '/static/dictionaries/jlpt_n1.json',
    '/static/dictionaries/conversation.json',
    '/static/dictionaries/computer.json',
    '/static/dictionaries/katakana.json'
];

// Kuromoji 词典文件
const KUROMOJI_RESOURCES = [
    '/static/kuromoji-dict/base.dat.gz',
    '/static/kuromoji-dict/base.json',
    '/static/kuromoji-dict/cc.dat.gz',
    '/static/kuromoji-dict/check.dat.gz',
    '/static/kuromoji-dict/tid_map.dat.gz',
    '/static/kuromoji-dict/tid_pos.dat.gz',
    '/static/kuromoji-dict/tid.dat.gz',
    '/static/kuromoji-dict/unk_char.dat.gz',
    '/static/kuromoji-dict/unk_compat.dat.gz',
    '/static/kuromoji-dict/unk_invoke.dat.gz',
    '/static/kuromoji-dict/unk_map.dat.gz',
    '/static/kuromoji-dict/unk_pos.dat.gz',
    '/static/kuromoji-dict/unk.dat.gz'
];

// Vendor 库文件
const VENDOR_RESOURCES = [
    '/static/vendor/kuromoji/kuromoji.js',
    '/static/vendor/kuroshiro/kuroshiro.min.js',
    '/static/vendor/kuroshiro-analyzer-kuromoji/kuroshiro-analyzer-kuromoji.min.js',
    '/static/vendor/wanakana/wanakana.min.js'
];

// Firebase CDN 资源
const CDN_RESOURCES = [
    'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js'
];

// 所有需要缓存的资源
const urlsToCache = [
    ...CORE_RESOURCES,
    ...DICTIONARY_RESOURCES,
    ...KUROMOJI_RESOURCES,
    ...VENDOR_RESOURCES,
    ...CDN_RESOURCES
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
    console.log('[Service Worker] 安装中...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] 缓存文件');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('[Service Worker] 缓存失败:', error);
            })
    );
    // 强制激活新的 Service Worker
    self.skipWaiting();
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] 激活中...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 立即接管所有客户端
    return self.clients.claim();
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // 仅处理 http/https，忽略如 chrome-extension:// 等协议
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return; // 让浏览器默认处理
    }

    event.respondWith(
        caches.match(req)
            .then((response) => {
                if (response) {
                    console.log('[Service Worker] 从缓存返回:', req.url);
                    return response;
                }

                return fetch(req)
                    .then((networkResp) => {
                        if (!networkResp || networkResp.status !== 200 || networkResp.type === 'error') {
                            return networkResp;
                        }

                        // 仅缓存 GET 的 http/https 响应
                        if (req.method === 'GET') {
                            const responseToCache = networkResp.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    // try/catch 保护，避免偶发 put 异常影响主流程
                                    try { cache.put(req, responseToCache); } catch (e) { console.warn('[SW] cache.put 跳过:', req.url, e); }
                                });
                        }

                        return networkResp;
                    })
                    .catch((error) => {
                        console.error('[Service Worker] 请求失败:', error);
                        return new Response('オフラインです', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({ 'Content-Type': 'text/plain' })
                        });
                    });
            })
    );
});

// 监听消息（用于手动触发缓存更新）
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(event.data.urls);
            })
        );
    }
    
    // 下载所有资源并报告进度
    if (event.data && event.data.type === 'DOWNLOAD_ALL') {
        event.waitUntil(
            downloadAllResources(event.source)
        );
    }
    
    // 检查缓存状态
    if (event.data && event.data.type === 'CHECK_CACHE') {
        event.waitUntil(
            checkCacheStatus(event.source)
        );
    }
});

// 下载所有资源并报告进度
async function downloadAllResources(client) {
    const cache = await caches.open(CACHE_NAME);
    const total = urlsToCache.length;
    let completed = 0;
    let failed = 0;
    
    // 发送开始消息
    client.postMessage({
        type: 'DOWNLOAD_PROGRESS',
        completed: 0,
        total: total,
        percentage: 0,
        status: 'started'
    });
    
    // 分批下载资源
    const batchSize = 5; // 每批下载5个
    for (let i = 0; i < urlsToCache.length; i += batchSize) {
        const batch = urlsToCache.slice(i, i + batchSize);
        
        await Promise.allSettled(
            batch.map(async (url) => {
                try {
                    const response = await fetch(url, { 
                        mode: 'cors',
                        cache: 'reload' 
                    });
                    if (response.ok) {
                        await cache.put(url, response);
                        completed++;
                    } else {
                        console.warn(`[SW] 下载失败: ${url} (${response.status})`);
                        failed++;
                    }
                } catch (error) {
                    console.error(`[SW] 下载错误: ${url}`, error);
                    failed++;
                }
                
                // 发送进度更新
                const percentage = Math.round((completed / total) * 100);
                client.postMessage({
                    type: 'DOWNLOAD_PROGRESS',
                    completed: completed,
                    total: total,
                    percentage: percentage,
                    failed: failed,
                    status: 'downloading'
                });
            })
        );
    }
    
    // 发送完成消息
    client.postMessage({
        type: 'DOWNLOAD_PROGRESS',
        completed: completed,
        total: total,
        percentage: 100,
        failed: failed,
        status: 'completed'
    });
}

// 检查缓存状态
async function checkCacheStatus(client) {
    const cache = await caches.open(CACHE_NAME);
    const cachedUrls = await cache.keys();
    const cachedCount = cachedUrls.length;
    const totalCount = urlsToCache.length;
    
    client.postMessage({
        type: 'CACHE_STATUS',
        cached: cachedCount,
        total: totalCount,
        percentage: Math.round((cachedCount / totalCount) * 100)
    });
}

