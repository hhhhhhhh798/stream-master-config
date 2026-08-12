// ============================================================
// wrapper.js - محول مستقل بالكامل (لا يعتمد على ملفات خارجية)
// ============================================================

// ============================================================
// 🌐 Vixsrc Provider (مدمج بالكامل)
// ============================================================
const VIXSRC_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://vixsrc.to/',
    'Origin': 'https://vixsrc.to'
};

async function fetchVixsrcStream(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vixsrc] جاري جلب البث لـ ${mediaType}/${tmdbId}...`);
    const BASE_URL = 'https://vixsrc.to';
    
    let apiUrl;
    if (mediaType === 'movie') {
        apiUrl = `${BASE_URL}/api/movie/${tmdbId}`;
    } else {
        apiUrl = `${BASE_URL}/api/tv/${tmdbId}/${seasonNum}/${episodeNum}`;
    }
    
    try {
        console.log(`[Vixsrc] إرسال طلب إلى: ${apiUrl}`);
        const response = await fetch(apiUrl, { headers: VIXSRC_HEADERS });
        
        if (!response.ok) {
            console.log(`[Vixsrc] ❌ فشل الطلب: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        console.log(`[Vixsrc] ✅ تم استلام البيانات: ${data ? 'موجودة' : 'فارغة'}`);
        
        if (!data || !data.src) {
            console.log('[Vixsrc] ❌ لا يوجد src في البيانات');
            return null;
        }
        
        const embedUrl = data.src.startsWith('http') ? data.src : `https://vixsrc.to${data.src}`;
        console.log(`[Vixsrc] جلب صفحة التضمين: ${embedUrl}`);
        
        const embedResponse = await fetch(embedUrl, { headers: VIXSRC_HEADERS });
        if (!embedResponse.ok) {
            console.log(`[Vixsrc] ❌ فشل جلب صفحة التضمين: ${embedResponse.status}`);
            return null;
        }
        
        const html = await embedResponse.text();
        console.log(`[Vixsrc] ✅ تم جلب HTML (${html.length} حرف)`);
        
        // استخراج البيانات
        const tokenMatch = html.match(/token["']?\s*:\s*["']([^"']+)["']/i);
        const expiresMatch = html.match(/expires["']?\s*:\s*["']([^"']+)["']/i);
        const playlistMatch = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) || 
                             html.match(/url["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        
        if (!tokenMatch || !expiresMatch || !playlistMatch) {
            console.log('[Vixsrc] ❌ لم يتم العثور على token/expires/playlist');
            return null;
        }
        
        const masterUrl = `${playlistMatch[1]}?token=${tokenMatch[1]}&expires=${expiresMatch[1]}&h=1`;
        console.log(`[Vixsrc] ✅ تم بناء الرابط النهائي: ${masterUrl.substring(0, 80)}...`);
        
        return {
            url: masterUrl,
            quality: 'HD',
            source: 'vixsrc',
            headers: VIXSRC_HEADERS
        };
        
    } catch (error) {
        console.error('[Vixsrc] ❌ خطأ:', error.message);
        return null;
    }
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
