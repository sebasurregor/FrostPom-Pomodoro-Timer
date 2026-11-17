package com.startupprometeus.frostpom.timer

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * FrostPom (v4.7.2) — los widgets, con el diseño nuevo ("Rediseño FrostPom": Widget grande y
 * Widget pequeño): una sola tarjeta con los animales del ártico de fondo.
 *
 *  - 4 × 2 (FrostWidgetLarge): ⌛ MODO ENFOQUE, la hora grande (el cronómetro de Android baja solo,
 *    cada segundo), la frase, la barra con tu compañero (blanco lo hecho, el color del modo lo que
 *    falta), lo hecho (sube solo) · el total, y los botones blancos ⏸ ⏮ ⏭ ✓. El globito arriba.
 *  - 2 × 2 (FrostWidgetSmall): ⌛ ENFOQUE, la hora, la barrita, ✓ y el botón grande del color del modo.
 *  - Si el widget es bajito (menos de 176 dp, según la pantalla de inicio), se esconden la frase y
 *    los números de la barra para que nada se corte.
 *  - La barra es un dibujo: se mueve cuando cambia algo (empezar, pausar, abrir la app) y cada
 *    2 min (TimerAlarm), porque Android limita cuántas veces se actualiza un widget.
 *  - (v4.7.3) La hora redondea como la app (25:00, no 24:59) y, quieta (pausa o reposo), se muestra
 *    como texto fijo: el cronómetro detenido se recalculaba cada vez que la pantalla de inicio
 *    volvía a dibujar el widget, y parecía seguir bajando.
 *  - Siempre oscuro (el dibujo ya trae su sombra), como en el diseño.
 */
open class FrostWidget : AppWidgetProvider() {
    open val large: Boolean = true

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // También llega al encender el teléfono y cada 30 min: de paso, vuelven la notificación y
        // el aviso del final si se habían perdido (TimerEngine.refresh pone al día los widgets).
        try {
            TimerEngine.refresh(context)
        } catch (e: Exception) {
            Log.w(TAG, "widget", e)
            try {
                val st = TimerStore.load(context)
                val now = System.currentTimeMillis()
                for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, build(context, st, now, large, appWidgetManager.getAppWidgetOptions(id)))
            } catch (e2: Exception) {
                Log.w(TAG, "widget (respaldo)", e2)
            }
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle?) {
        // Cambiaste el tamaño del widget: se dibuja de nuevo a su medida
        try {
            appWidgetManager.updateAppWidget(appWidgetId, build(context, TimerStore.load(context), System.currentTimeMillis(), large, newOptions))
        } catch (e: Exception) {
            Log.w(TAG, "widget (tamaño)", e)
        }
    }

    companion object {
        private const val TAG = "FrostTimer"
        private const val WHITE = 0xFFFFFFFF.toInt()

        /** El color de cada modo: estudio dorado, descanso verde, descanso largo celeste. */
        fun accent(mode: String): Int = when (mode) {
            TimerState.STUDY -> 0xFFFFC531.toInt()
            TimerState.LONG -> 0xFF8EC5FF.toInt()
            else -> 0xFF2ED8A3.toInt()
        }

        /** El color del texto del modo (en estudio, blanco; en descanso, más claro que el botón). */
        private fun modeInk(mode: String): Int = when (mode) {
            TimerState.STUDY -> WHITE
            TimerState.LONG -> 0xFFCFE6FF.toInt()
            else -> 0xFF9FF2D6.toInt()
        }

        /** Pone al día todos los widgets que la persona tenga en su pantalla (cada uno a su tamaño). */
        fun updateAll(ctx: Context, st: TimerState, now: Long) {
            val m = AppWidgetManager.getInstance(ctx) ?: return
            for ((cls, large) in listOf(FrostWidgetLarge::class.java to true, FrostWidgetSmall::class.java to false)) {
                for (id in m.getAppWidgetIds(ComponentName(ctx, cls))) {
                    try {
                        m.updateAppWidget(id, build(ctx, st, now, large, m.getAppWidgetOptions(id)))
                    } catch (e: Exception) {
                        Log.w(TAG, "widget $id", e)
                    }
                }
            }
        }

        /** El tamaño del widget en dp (en vertical: el ancho mínimo y el alto máximo). */
        private fun sizeDp(opts: Bundle?, large: Boolean): Pair<Int, Int> {
            val w = opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
            val h = opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) ?: 0
            return (if (w > 0) w else if (large) 340 else 170) to (if (h > 0) h else if (large) 175 else 170)
        }

        fun build(ctx: Context, st: TimerState, now: Long, large: Boolean, opts: Bundle? = null): RemoteViews {
            val t = TimerStore.texts(ctx)
            val v = RemoteViews(ctx.packageName, if (large) R.layout.fp_widget_large else R.layout.fp_widget_small)
            val (wDp, hDp) = sizeDp(opts, large)
            val shown = if (st.status == TimerState.DONE && st.doneMode.isNotEmpty()) st.doneMode else st.mode
            val color = accent(shown)
            val open = TimerNotification.openApp(ctx)
            val longBlock = st.durationSec >= 3600

            // ⌛ / ☕ y el modo, en mayúsculas ("MODO ENFOQUE"; en el pequeño, "ENFOQUE")
            v.setImageViewResource(R.id.fp_mode_icon, if (shown == TimerState.STUDY) R.drawable.fp_ic_hourglass else R.drawable.fp_ic_cup)
            v.setInt(R.id.fp_mode_icon, "setColorFilter", modeInk(shown))
            val label = if (large) t.mode(shown) else t.modeShort(shown)
            v.setTextViewText(R.id.fp_mode, label.uppercase(Locale.getDefault()))
            v.setTextColor(R.id.fp_mode, modeInk(shown))

            // La hora: corriendo, baja sola; en pausa o en reposo, quieta en lo que falta
            val left = st.remainingAt(now)
            countdown(v, R.id.fp_time, left, st.status == TimerState.RUNNING)
            v.setOnClickPendingIntent(R.id.fp_time, open)
            v.setOnClickPendingIntent(R.id.fp_art, open)

            // ▶/⏸ (con el bloque terminado, abre la app para guardarlo)
            val running = st.status == TimerState.RUNNING
            v.setImageViewResource(R.id.fp_toggle, if (running) R.drawable.fp_ic_pause else R.drawable.fp_ic_play)
            v.setContentDescription(R.id.fp_toggle, if (running) t.pause else if (st.status == TimerState.PAUSED) t.resume else t.start)
            v.setOnClickPendingIntent(
                R.id.fp_toggle,
                if (st.status == TimerState.DONE) open else TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_TOGGLE),
            )
            // ✓ Terminar y guardar: solo en estudio, con algo hecho
            val canFinish = st.canFinish && st.mode == TimerState.STUDY && (running || st.status == TimerState.PAUSED)
            v.setViewVisibility(R.id.fp_finish, if (canFinish) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.fp_finish, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_FINISH))
            v.setContentDescription(R.id.fp_finish, t.finish)

            if (!large) {
                v.setTextViewTextSize(R.id.fp_time, TypedValue.COMPLEX_UNIT_SP, if (longBlock) 30f else 38f)
                v.setInt(R.id.fp_toggle, "setBackgroundResource", when (shown) {
                    TimerState.STUDY -> R.drawable.fp_btn_gold
                    TimerState.LONG -> R.drawable.fp_btn_sky
                    else -> R.drawable.fp_btn_mint
                })
                v.setImageViewBitmap(R.id.fp_bar, miniBar(ctx, st, now, color))
                return v
            }

            // Bajito (menos de 176 dp, lo que mide todo con la hora grande): sin la frase ni los
            // números de la barra, y la hora un poco más chica, para que los botones no se corten
            val compact = hDp < 176
            v.setTextViewTextSize(R.id.fp_time, TypedValue.COMPLEX_UNIT_SP, when {
                longBlock && compact -> 30f
                longBlock -> 36f
                compact -> 36f
                else -> 46f
            })
            v.setViewVisibility(R.id.fp_phrase, if (compact) View.GONE else View.VISIBLE)
            v.setViewVisibility(R.id.fp_labels, if (compact) View.GONE else View.VISIBLE)
            v.setTextViewText(R.id.fp_phrase, t.phrase(st))

            // La barra con tu compañero, a la medida de la columna (60 % del ancho, sin márgenes)
            val colDp = max(120f, wDp * 0.6f - 20f)
            v.setImageViewBitmap(R.id.fp_bar, bar(ctx, st, now, color, colDp))

            // Lo hecho (sube solo) · el total
            val done = st.elapsedAt(now)
            if (running) {
                v.setChronometer(R.id.fp_elapsed, SystemClock.elapsedRealtime() - done, null, true)
            } else {
                v.setChronometer(R.id.fp_elapsed, SystemClock.elapsedRealtime() - done, clock(done), false) // texto fijo
            }
            v.setChronometerCountDown(R.id.fp_elapsed, false)
            v.setTextViewText(R.id.fp_total, clock(st.durationSec * 1000L))

            val active = running || st.status == TimerState.PAUSED
            v.setViewVisibility(R.id.fp_reset, if (active) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.fp_reset, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_RESET))
            v.setContentDescription(R.id.fp_reset, t.reset)
            v.setViewVisibility(R.id.fp_skip, if (st.status == TimerState.DONE) View.GONE else View.VISIBLE)
            v.setOnClickPendingIntent(R.id.fp_skip, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_SKIP))
            v.setContentDescription(R.id.fp_skip, t.skip)
            v.setTextViewText(R.id.fp_bubble, t.bubble(shown))
            v.setOnClickPendingIntent(R.id.fp_open, open)
            v.setOnClickPendingIntent(R.id.fp_col, open)
            v.setOnClickPendingIntent(R.id.fp_bubble, open)
            return v
        }

        /**
         * (v4.7.3) La cuenta regresiva. Corriendo, el cronómetro de Android baja solo; se le suman
         * 999 ms porque él corta los segundos y la app redondea hacia arriba (25:00, no 24:59).
         * Quieta, va como texto fijo (el formato sin "%s" se muestra tal cual).
         */
        private fun countdown(v: RemoteViews, id: Int, left: Long, running: Boolean) {
            if (running) {
                v.setChronometer(id, SystemClock.elapsedRealtime() + left + 999L, null, true)
            } else {
                v.setChronometer(id, SystemClock.elapsedRealtime() + left, clock(left, up = true), false)
            }
            v.setChronometerCountDown(id, true)
        }

        /** 1500000 ms → "25:00" (o "1:30:00"), como el cronómetro de Android; up = redondea hacia arriba. */
        fun clock(ms: Long, up: Boolean = false): String {
            val total = (max(0L, ms) + if (up) 999L else 0L) / 1000
            val h = total / 3600
            val m = (total % 3600) / 60
            val s = total % 60
            return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
        }

        private fun density(ctx: Context): Float = ctx.resources.displayMetrics.density

        /**
         * La barra del 4 × 2 (24 dp de alto): blanco lo hecho, el color del modo lo que falta y tu
         * compañero justo donde va el bloque, con una sombrita.
         */
        private fun bar(ctx: Context, st: TimerState, now: Long, color: Int, widthDp: Float): Bitmap {
            val d = min(density(ctx), 3f)
            val w = max(120, (widthDp * d).roundToInt())
            val h = max(36, (24f * d).roundToInt())
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val c = Canvas(bmp)
            val p = Paint(Paint.ANTI_ALIAS_FLAG)
            val thumb = h.toFloat()
            val trackH = 6f * d
            val top = (h - trackH) / 2f
            val track = RectF(thumb / 2f, top, w - thumb / 2f, top + trackH)
            val f = st.progressAt(now)
            val split = track.left + track.width() * f
            // Lo que falta (color del modo) y, encima, lo hecho (blanco)
            p.color = color
            c.drawRoundRect(track, trackH / 2f, trackH / 2f, p)
            if (f > 0f) {
                p.color = WHITE
                c.drawRoundRect(RectF(track.left, track.top, max(split, track.left + trackH), track.bottom), trackH / 2f, trackH / 2f, p)
            }
            // Tu compañero, con sombra
            val cx = split
            val cy = h / 2f
            val shadow = Paint(Paint.ANTI_ALIAS_FLAG)
            shadow.shader = RadialGradient(cx, cy + thumb * 0.08f, thumb * 0.55f, intArrayOf(0x66000000, 0x00000000), null, Shader.TileMode.CLAMP)
            c.drawCircle(cx, cy + thumb * 0.08f, thumb * 0.55f, shadow)
            TimerNotification.companion(ctx, st.companion)?.let { pic ->
                c.drawBitmap(pic, null, RectF(cx - thumb / 2f, 0f, cx + thumb / 2f, thumb), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
            }
            return bmp
        }

        /** La barrita del 2 × 2 (96 × 5 dp): blanco lo hecho, el color del modo lo que falta. */
        private fun miniBar(ctx: Context, st: TimerState, now: Long, color: Int): Bitmap {
            val d = min(density(ctx), 3f)
            val w = (96f * d).roundToInt()
            val h = max(8, (5f * d).roundToInt())
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val c = Canvas(bmp)
            val p = Paint(Paint.ANTI_ALIAS_FLAG)
            val r = h / 2f
            p.color = color
            c.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), r, r, p)
            val f = st.progressAt(now)
            if (f > 0f) {
                p.color = WHITE
                c.drawRoundRect(RectF(0f, 0f, max(w * f, h.toFloat()), h.toFloat()), r, r, p)
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
