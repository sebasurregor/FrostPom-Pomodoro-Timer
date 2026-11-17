package com.startupprometeus.frostpom.timer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log

/**
 * FrostPom (v4.7.2) — la "sesión de reproducción" que convierte la notificación en curso en un
 * reproductor, como el de Spotify (el autor eligió "Estilo reproductor"):
 *
 *  - En la pantalla de bloqueo y en el panel rápido, Android la dibuja con los animales del ártico
 *    de fondo, el modo ("Modo enfoque"), la frase, la barra que avanza sola (sin gastar batería:
 *    Android la mueve con la hora de inicio y la velocidad) y los botones ⏮ ⏸ ⏭ ✓.
 *  - No suena nada ni pide el audio: solo usa el aspecto de reproductor.
 *  - Los botones del reproductor llegan aquí (Callback) y hacen lo mismo que los del widget.
 *  - La sesión vive mientras viva la app en memoria. Si Android la cierra para liberar memoria,
 *    la próxima actualización (cada 2 min, un botón, el aviso del final o abrir la app) la crea de
 *    nuevo; mientras tanto la notificación sigue con sus botones normales (TimerActionReceiver).
 */
object TimerMedia {
    private const val TAG = "FrostTimer"
    const val ACTION_FINISH = "fp_finish"
    private var session: MediaSession? = null
    private var art: Bitmap? = null
    private val main = Handler(Looper.getMainLooper())

    /** Pone al día la sesión (la crea si hace falta) y devuelve su token, o null si no se pudo. */
    fun token(ctx: Context, st: TimerState, now: Long, t: Texts): MediaSession.Token? = synchronized(this) {
        try {
            val app = ctx.applicationContext
            val s = session ?: MediaSession(app, "FrostPom").also {
                it.setCallback(Callback(app), main)
                it.setSessionActivity(TimerNotification.openApp(app))
                session = it
                Log.i(TAG, "media: sesión nueva")
            }
            s.setMetadata(metadata(app, st, t))
            s.setPlaybackState(playback(st, now, t))
            if (!s.isActive) s.isActive = true
            s.sessionToken
        } catch (e: Exception) {
            Log.w(TAG, "media", e)
            null
        }
    }

    /** Sin bloque en curso: la sesión se cierra (el reproductor desaparece). */
    fun release() = synchronized(this) {
        try {
            session?.let {
                it.isActive = false
                it.release()
                Log.i(TAG, "media: sesión cerrada")
            }
        } catch (e: Exception) {
            Log.w(TAG, "media release", e)
        }
        session = null
    }

    /** Los animales del ártico (cuadrado, 512 px): el fondo del reproductor. */
    fun art(ctx: Context): Bitmap? {
        art?.let { return it }
        return try {
            BitmapFactory.decodeResource(ctx.resources, R.drawable.fp_media_art).also { art = it }
        } catch (e: Exception) {
            null
        }
    }

    private fun metadata(ctx: Context, st: TimerState, t: Texts): MediaMetadata {
        val b = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, t.mode(st.mode))
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, t.mode(st.mode))
            .putString(MediaMetadata.METADATA_KEY_ARTIST, t.phrase(st))
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, t.phrase(st))
            .putString(MediaMetadata.METADATA_KEY_ALBUM, "FrostPom")
            .putLong(MediaMetadata.METADATA_KEY_DURATION, st.durationSec * 1000L)
        art(ctx)?.let {
            b.putBitmap(MediaMetadata.METADATA_KEY_ART, it)
            b.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it)
        }
        return b.build()
    }

    /**
     * La barra: Android la mueve sola desde "position" (lo hecho) a "speed" (1 corriendo, 0 en
     * pausa). Sin ACTION_SEEK_TO: la barra se ve pero no se puede arrastrar.
     */
    private fun playback(st: TimerState, now: Long, t: Texts): PlaybackState {
        val running = st.status == TimerState.RUNNING
        var actions = PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS
        actions = actions or if (running) PlaybackState.ACTION_PAUSE else PlaybackState.ACTION_PLAY
        val b = PlaybackState.Builder()
            .setActions(actions)
            .setState(
                if (running) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                st.elapsedAt(now),
                if (running) 1f else 0f,
                SystemClock.elapsedRealtime(),
            )
        if (st.canFinish && st.mode == TimerState.STUDY) {
            b.addCustomAction(PlaybackState.CustomAction.Builder(ACTION_FINISH, t.finish, R.drawable.fp_ic_check).build())
        }
        return b.build()
    }

    /** Los botones del reproductor (llegan en el hilo principal). */
    private class Callback(private val app: Context) : MediaSession.Callback() {
        private fun status(): String = TimerStore.load(app).status

        private fun press(button: String) {
            try {
                Log.i(TAG, "media: $button")
                TimerEngine.act(app, button)
            } catch (e: Exception) {
                Log.w(TAG, "media $button", e)
            }
        }

        override fun onPlay() {
            val s = status()
            if (s == TimerState.PAUSED || s == TimerState.IDLE) press("toggle")
        }

        override fun onPause() {
            if (status() == TimerState.RUNNING) press("toggle")
        }

        override fun onSkipToNext() = press("skip")

        override fun onSkipToPrevious() = press("reset")

        override fun onCustomAction(action: String, extras: android.os.Bundle?) {
            if (action == ACTION_FINISH) press("finish")
        }
    }
}
