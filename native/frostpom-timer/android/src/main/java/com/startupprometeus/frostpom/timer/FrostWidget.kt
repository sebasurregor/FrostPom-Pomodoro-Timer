package com.startupprometeus.frostpom.timer

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import java.util.Locale

/**
 * FrostPom (v4.6) — el widget, con el diseño del autor (su mockup "FOCUS SESSION").
 *
 *  - 4 × 2 (FrostWidgetLarge): a la izquierda, sobre una tarjeta, ⌛ el modo, la hora grande (el
 *    cronómetro de Android baja solo, cada segundo), la frase, la barra con tu compañero y los
 *    botones ▶/⏸ ⏮ ⏭ ✓. A la derecha, los animales en la fogata (artico-amigos) con el globito.
 *  - 2 × 2 (FrostWidgetSmall): el modo, la hora y ▶/⏸.
 *  - La barra con el compañero es un dibujo: se mueve cuando cambia algo (empezar, pausar, abrir
 *    la app) y cada 15 min, porque Android limita cuántas veces se actualiza un widget.
 *  - Tema: el de la app (claro u oscuro) o el del teléfono si la app está en "automático".
 */
open class FrostWidget : AppWidgetProvider() {
    open val large: Boolean = true

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        try {
            val views = build(context, TimerStore.load(context), System.currentTimeMillis(), large)
            appWidgetManager.updateAppWidget(appWidgetIds, views)
        } catch (e: Exception) {
            android.util.Log.w("FrostTimer", "widget", e)
        }
    }

    companion object {
        private const val INK_DARK = 0xFFFFFFFF.toInt()
        private const val SUB_DARK = 0xCCDCE6FF.toInt()
        private const val INK_LIGHT = 0xFF1B2A4A.toInt()
        private const val SUB_LIGHT = 0xFF4A5A7A.toInt()

        /** Pone al día todos los widgets que la persona tenga en su pantalla. */
        fun updateAll(ctx: Context, st: TimerState, now: Long) {
            val m = AppWidgetManager.getInstance(ctx) ?: return
            for ((cls, large) in listOf(FrostWidgetLarge::class.java to true, FrostWidgetSmall::class.java to false)) {
                val ids = m.getAppWidgetIds(ComponentName(ctx, cls))
                if (ids.isNotEmpty()) m.updateAppWidget(ids, build(ctx, st, now, large))
            }
        }

        private fun dark(ctx: Context, st: TimerState): Boolean = when (st.theme) {
            "dark" -> true
            "light" -> false
            else -> (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        }

        fun build(ctx: Context, st: TimerState, now: Long, large: Boolean): RemoteViews {
            val t = TimerStore.texts(ctx)
            val night = dark(ctx, st)
            val ink = if (night) INK_DARK else INK_LIGHT
            val sub = if (night) SUB_DARK else SUB_LIGHT
            val v = RemoteViews(ctx.packageName, if (large) R.layout.fp_widget_large else R.layout.fp_widget_small)
            v.setInt(R.id.fp_card, "setBackgroundResource", if (night) R.drawable.fp_card_dark else R.drawable.fp_card_light)

            // El modo, en mayúsculas ("MODO ENFOQUE")
            val shown = if (st.status == TimerState.DONE && st.doneMode.isNotEmpty()) st.doneMode else st.mode
            v.setTextViewText(R.id.fp_mode, t.mode(shown).uppercase(Locale.getDefault()))
            v.setTextColor(R.id.fp_mode, sub)

            // La hora: corriendo, baja sola; en pausa o en reposo, quieta en lo que falta
            val left = st.remainingAt(now)
            v.setChronometer(R.id.fp_time, SystemClock.elapsedRealtime() + left, null, st.status == TimerState.RUNNING)
            v.setChronometerCountDown(R.id.fp_time, true)
            v.setTextColor(R.id.fp_time, ink)
            v.setOnClickPendingIntent(R.id.fp_time, TimerNotification.openApp(ctx))

            // ▶/⏸ (con el bloque terminado, abre la app para guardarlo)
            val running = st.status == TimerState.RUNNING
            v.setImageViewResource(R.id.fp_toggle, if (running) R.drawable.fp_ic_pause else R.drawable.fp_ic_play)
            v.setContentDescription(R.id.fp_toggle, if (running) t.pause else if (st.status == TimerState.PAUSED) t.resume else t.start)
            v.setOnClickPendingIntent(
                R.id.fp_toggle,
                if (st.status == TimerState.DONE) TimerNotification.openApp(ctx) else TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_TOGGLE),
            )
            if (!large) return v

            v.setTextViewText(R.id.fp_phrase, t.phrase(st))
            v.setTextColor(R.id.fp_phrase, sub)
            v.setImageViewBitmap(R.id.fp_bar, bar(ctx, st, now, night))
            val active = st.status == TimerState.RUNNING || st.status == TimerState.PAUSED
            v.setViewVisibility(R.id.fp_reset, if (active) View.VISIBLE else View.INVISIBLE)
            v.setOnClickPendingIntent(R.id.fp_reset, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_RESET))
            v.setContentDescription(R.id.fp_reset, t.reset)
            v.setViewVisibility(R.id.fp_skip, if (st.status == TimerState.DONE) View.INVISIBLE else View.VISIBLE)
            v.setOnClickPendingIntent(R.id.fp_skip, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_SKIP))
            v.setContentDescription(R.id.fp_skip, t.skip)
            v.setViewVisibility(R.id.fp_finish, if (st.canFinish && st.mode == TimerState.STUDY) View.VISIBLE else View.INVISIBLE)
            v.setOnClickPendingIntent(R.id.fp_finish, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_FINISH))
            v.setContentDescription(R.id.fp_finish, t.finish)
            v.setTextViewText(R.id.fp_bubble, t.bubble(shown))
            v.setOnClickPendingIntent(R.id.fp_art, TimerNotification.openApp(ctx))
            return v
        }

        /** La barra del bloque con tu compañero encima (420 × 56 px). */
        private fun bar(ctx: Context, st: TimerState, now: Long, night: Boolean): Bitmap {
            val w = 420
            val h = 56
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val c = Canvas(bmp)
            val p = Paint(Paint.ANTI_ALIAS_FLAG)
            val icon = 48f
            val trackH = 14f
            val top = (h - trackH) / 2f
            val track = RectF(icon / 2f, top, w - icon / 2f, top + trackH)
            p.color = if (night) 0x33FFFFFF else 0x221B2A4A
            c.drawRoundRect(track, trackH / 2f, trackH / 2f, p)
            val f = st.progressAt(now)
            if (f > 0f) {
                p.color = when (st.mode) {
                    TimerState.STUDY -> 0xFFFFC23D.toInt()
                    TimerState.LONG -> 0xFF8EC5FF.toInt()
                    else -> 0xFF5FE0B9.toInt()
                }
                c.drawRoundRect(RectF(track.left, track.top, track.left + (track.width() * f).coerceAtLeast(trackH), track.bottom), trackH / 2f, trackH / 2f, p)
            }
            TimerNotification.companion(ctx, st.companion)?.let { pic ->
                val x = track.left + track.width() * f - icon / 2f
                c.drawBitmap(pic, null, RectF(x, (h - icon) / 2f, x + icon, (h + icon) / 2f), Paint(Paint.FILTER_BITMAP_FLAG))
            }
            return bmp
        }
    }
}

/** El widget de 4 × 2. */
class FrostWidgetLarge : FrostWidget() {
    override val large: Boolean = true
}

/** El widget de 2 × 2. */
class FrostWidgetSmall : FrostWidget() {
    override val large: Boolean = false
}
