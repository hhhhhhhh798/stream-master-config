// ============================================================
// wrapper.js - محول مستقل (يستخدم axios بدلاً من fetch)
// ============================================================

const axios = require('axios');

// ============================================================
// 🌐 Vixsrc Provider (مدمج بالكامل)
// ============================================================
const VIXSRC_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://vixsrc.to/',
    'Origin': 'https://vixsrc.to',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
};

async function fetchVixsrcStream(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vixsrc] جاري جلب البث لـ ${mediaType}/${tmdbId}...`);
    
    const BASE_URLS = ['https://vixsrc.to', 'https://vsembed.ru'];
    let lastError = null;
    
    for (const baseUrl of BASE_URLS) {
        try {
            let apiUrl;
            if (mediaType === 'movie') {
                apiUrl = `${baseUrl}/api/movie/${tmdbId}`;
            } else {
                apiUrl = `${baseUrl}/api/tv/${tmdbId}/${seasonNum}/${episodeNum}`;
            }
            
            console.log(`[Vixsrc] إرسال طلب إلى: ${apiUrl}`);
            const response = await axios.get(apiUrl, { 
                headers: VIXSRC_HEADERS,
                timeout: 15000,
                validateStatus: () => true // قبول جميع حالات HTTP للتعامل معها يدوياً
            });
            
            if (response.status !== 200) {
                console.log(`[Vixsrc] ❌ فشل الطلب: ${response.status} (${baseUrl})`);
                if (response.status === 403) {
                    console.log('[Vixsrc] ⚠️ تم حظر الطلب (403)، جرب المصدر التالي...');
                }
                continue;
            }
            
            const data = response.data;
            console.log(`[Vixsrc] ✅ تم استلام البيانات: ${data ? 'موجودة' : 'فارغة'} (${baseUrl})`);
            
            if (!data || !data.src) {
                console.log('[Vixsrc] ❌ لا يوجد src في البيانات');
                continue;
            }
            
            const embedUrl = data.src.startsWith('http') ? data.src : `https://${baseUrl.split('//')[1]}${data.src}`;
            console.log(`[Vixsrc] جلب صفحة التضمين: ${embedUrl}`);
            
            const embedResponse = await axios.get(embedUrl, { 
                headers: VIXSRC_HEADERS,
                timeout: 15000
            });
            
            if (embedResponse.status !== 200) {
                console.log(`[Vixsrc] ❌ فشل جلب صفحة التضمين: ${embedResponse.status}`);
                continue;
            }
            
            const html = embedResponse.data;
            console.log(`[Vixsrc] ✅ تم جلب HTML (${html.length} حرف) (${baseUrl})`);
            
            // استخراج البيانات
            const tokenMatch = html.match(/token["']?\s*:\s*["']([^"']+)["']/i);
            const expiresMatch = html.match(/expires["']?\s*:\s*["']([^"']+)["']/i);
            const playlistMatch = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) || 
                                 html.match(/url["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            
            if (!tokenMatch || !expiresMatch || !playlistMatch) {
                console.log('[Vixsrc] ❌ لم يتم العثور على token/expires/playlist');
                continue;
            }
            
            const masterUrl = `${playlistMatch[1]}?token=${tokenMatch[1]}&expires=${expiresMatch[1]}&h=1`;
            console.log(`[Vixsrc] ✅ تم بناء الرابط النهائي: ${masterUrl.substring(0, 80)}... (${baseUrl})`);
            
            return {
                url: masterUrl,
                quality: 'HD',
                source: 'vixsrc',
                headers: VIXSRC_HEADERS
            };
            
        } catch (error) {
            console.error(`[Vixsrc] ❌ خطأ مع ${baseUrl}:`, error.message);
            lastError = error;
        }
    }
    
    console.error('[Vixsrc] ❌ فشلت جميع المحاولات:', lastError ? lastError.message : 'unknown');
    return null;
}

// ============================================================
// 🚀 الدالة الرئيسية
// ============================================================
async function getResource(movieInfo, config, userCookie, callback) {
    console.log('[Wrapper] بدء getResource...');
    console.log(`[Wrapper] movieInfo:`, JSON.stringify(movieInfo));
    
    try {
        const { tmdb_id, type, season, episode } = movieInfo;
        const tmdbType = (type === 'movie' || type === '1') ? 'movie' : 'tv';
        
        console.log(`[Wrapper] جاري جلب البث لـ ${tmdbType}/${tmdb_id}...`);
        
        const stream = await fetchVixsrcStream(tmdb_id, tmdbType, season || null, episode || null);
        
        if (stream) {
            console.log('[Wrapper] ✅ تم العثور على رابط من Vixsrc');
            callback({
                url: stream.url,
                quality: stream.quality || 'auto',
                headers: stream.headers || {},
                subtitles: []
            });
            return true;
        }
        
        console.log('[Wrapper] ❌ لم يتم العثور على روابط');
        return false;
        
    } catch (error) {
        console.error('[Wrapper] ❌ خطأ عام:', error.message);
        console.error('[Wrapper] Stack:', error.stack);
        return false;
    }
}

module.exports = { getResource };
