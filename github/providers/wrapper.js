// ============================================================
// wrapper.js - محول مستقل (جميع الدوال مدمجة داخله)
// ============================================================

// ============================================================
// 🌐 Vixsrc Provider (مدمج بالكامل)
// ============================================================
const VIXSRC_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Referer': 'https://vixsrc.to/',
    'Origin': 'https://vixsrc.to'
};

async function fetchVixsrcStream(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    const BASE_URL = 'https://vixsrc.to';
    
    let apiUrl;
    if (mediaType === 'movie') {
        apiUrl = `${BASE_URL}/api/movie/${tmdbId}`;
    } else {
        apiUrl = `${BASE_URL}/api/tv/${tmdbId}/${seasonNum}/${episodeNum}`;
    }
    
    try {
        const response = await fetch(apiUrl, { headers: VIXSRC_HEADERS });
        if (!response.ok) return null;
        
        const data = await response.json();
        if (!data || !data.src) return null;
        
        const embedUrl = data.src.startsWith('http') ? data.src : `https://vixsrc.to${data.src}`;
        const embedResponse = await fetch(embedUrl, { headers: VIXSRC_HEADERS });
        const html = await embedResponse.text();
        
        const tokenMatch = html.match(/token["']?\s*:\s*["']([^"']+)["']/i);
        const expiresMatch = html.match(/expires["']?\s*:\s*["']([^"']+)["']/i);
        const playlistMatch = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) || 
                             html.match(/url["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        
        if (!tokenMatch || !expiresMatch || !playlistMatch) return null;
        
        const masterUrl = `${playlistMatch[1]}?token=${tokenMatch[1]}&expires=${expiresMatch[1]}&h=1`;
        
        return {
            url: masterUrl,
            quality: 'HD',
            source: 'vixsrc',
            headers: VIXSRC_HEADERS
        };
    } catch (error) {
        console.error('[Vixsrc] Error:', error.message);
        return null;
    }
}

// ============================================================
// 🚀 الدالة الرئيسية (تجرب Vixsrc فقط)
// ============================================================
async function getResource(movieInfo, config, userCookie, callback) {
    try {
        const { tmdb_id, type, season, episode } = movieInfo;
        const tmdbType = (type === 'movie' || type === '1') ? 'movie' : 'tv';
        
        console.log(`[Wrapper] جاري محاولة جلب البث لـ ${tmdbType}/${tmdb_id}...`);
        
        const stream = await fetchVixsrcStream(tmdb_id, tmdbType, season || null, episode || null);
        
        if (stream) {
            console.log(`[Wrapper] Vixsrc: تم العثور على رابط`);
            callback({
                url: stream.url,
                quality: stream.quality || 'auto',
                headers: stream.headers || {},
                subtitles: []
            });
            return true;
        }
        
        console.log('[Wrapper] لم يتم العثور على روابط');
        return false;
    } catch (error) {
        console.error('[Wrapper] خطأ:', error.message);
        return false;
    }
}

module.exports = { getResource };
