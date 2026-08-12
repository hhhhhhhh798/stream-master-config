// ============================================================
// wrapper.js - محول يستخدم Showbox فقط (مع كوكيز Vercel)
// ============================================================

const path = require('path');

const PROVIDERS_DIR = __dirname;
const showboxModule = require(path.join(PROVIDERS_DIR, 'Showbox'));

async function getResource(movieInfo, config, userCookie, callback) {
    try {
        const { tmdb_id, type, season, episode } = movieInfo;
        const tmdbType = (type === 'movie' || type === '1') ? 'movie' : 'tv';
        
        console.log(`[Wrapper] جاري محاولة Showbox لـ ${tmdbType}/${tmdb_id}...`);
        
        const streams = await showboxModule.getStreamsFromTmdbId(
            tmdbType,
            tmdb_id,
            season || null,
            episode || null,
            'USA7',
            userCookie || null
        );

        if (streams && streams.length > 0) {
            const bestStream = streams[0];
            console.log(`[Wrapper] Showbox: تم العثور على رابط بنجاح: ${bestStream.url}`);
            callback({
                url: bestStream.url,
                quality: bestStream.quality || 'auto',
                headers: bestStream.headers || {},
                subtitles: bestStream.subtitles || []
            });
            return true;
        }

        console.log('[Wrapper] Showbox: لم يتم العثور على روابط');
        return false;

    } catch (error) {
        console.error('[Wrapper] خطأ في Showbox:', error.message);
        return false;
    }
}

module.exports = { getResource };


//
