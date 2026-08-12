// ============================================================
// wrapper.js - محول موحد يدعم أولوية Showbox ثم Vixsrc كاحتياطي
// ============================================================

const path = require('path');

const PROVIDERS_DIR = __dirname;
const showboxModule = require(path.join(PROVIDERS_DIR, 'Showbox'));
const vixsrcModule = require(path.join(PROVIDERS_DIR, 'vixsrc'));

function createUnifiedResource() {
    return async function getResource(movieInfo, config, userCookie, callback) {
        try {
            const { tmdb_id, type, season, episode } = movieInfo;
            const tmdbType = (type === 'movie' || type === '1') ? 'movie' : 'tv';
            
            // 1. محاولة استخدام Showbox أولاً
            console.log(`[Wrapper] جاري محاولة Showbox لـ ${tmdbType}/${tmdb_id}...`);
            try {
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
            } catch (showboxErr) {
                console.warn(`[Wrapper] Showbox فشل، سيتم الانتقال للبديل: ${showboxErr.message}`);
            }

            // 2. التحول إلى Vixsrc كاحتياطي
            console.log(`[Wrapper] جاري محاولة Vixsrc (احتياطي) لـ ${tmdbType}/${tmdb_id}...`);
            const vixResult = await vixsrcModule.getVixsrcStreams(
                tmdb_id,
                tmdbType,
                season || null,
                episode || null
            );
            if (vixResult && vixResult.streams && vixResult.streams.length > 0) {
                const bestStream = vixResult.streams[0];
                console.log(`[Wrapper] Vixsrc: تم العثور على رابط احتياطي: ${bestStream.url}`);
                callback({
                    url: bestStream.url,
                    quality: bestStream.quality || 'auto',
                    headers: bestStream.headers || {},
                    subtitles: vixResult.subtitles || []
                });
                return true;
            }

            console.log('[Wrapper] عذراً، لم يتم العثور على أي روابط صالحة من كلا المزودين.');
            return false;

        } catch (error) {
            console.error('[Wrapper] خطأ عام في جلب الموارد:', error.message);
            return false;
        }
    };
}

module.exports = {
    getResource: createUnifiedResource(),
    Showbox: createUnifiedResource(),
    vixsrc: createUnifiedResource()
};
