package com.startupprometeus.frostpom.timer

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.os.Build
import kotlin.math.max

/**
 * FrostPom (v4.6) — la notificación en curso ("como Spotify") y el aviso del final.
 *
 *  - En curso: el modo, la cuenta regresiva (el cronómetro de Android baja solo, sin que la app
 *    tenga que actualizarla cada segundo), tu compañero y los botones Pausar/Continuar, Saltar y
 *    Terminar y guardar. Desaparece sola al llegar a cero. Canal propio de importancia baja: no
 *    suena ni vibra cada vez que cambia.
 *  - Aviso del final: el mismo canal "frostpom" que ya usa la app (importancia alta).
 *  - Sin servicio en primer plano (Google Play pide justificarlos y un temporizador no califica).
 */
object TimerNotification {
    const val CHANNEL_TIMER = "frostpom_timer"
    const val CHANNEL_ALERT = "frostpom" // el de la app (js/native.js: CHANNEL)
    const val ID_ONGOING = 4100
    const val ID_END = 4101
    private const val ACCENT = 0xFF2D68BC.toInt()
    private var companionCache: Pair<String, Bitmap?>? = null

    private fun canNotify(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun ensureChannels(ctx: Context, t: Texts) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val timer = NotificationChannel(CHANNEL_TIMER, t.channel, NotificationManager.IMPORTANCE_LOW)
        timer.description = t.channelDesc
        timer.setSound(null, null)
        timer.enableVibration(false)
        timer.setShowBadge(false)
        timer.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        nm.createNotificationChannel(timer) // si ya existe, solo se actualizan el nombre y la descripción
        if (nm.getNotificationChannel(CHANNEL_ALERT) == null) {
            val alert = NotificationChannel(CHANNEL_ALERT, ctx.getString(R.string.fp_channel_alert), NotificationManager.IMPORTANCE_HIGH)
            alert.description = ctx.getString(R.string.fp_channel_alert_desc)
            nm.createNotificationChannel(alert)
        }
    }

    private fun builder(ctx: Context, channel: String, low: Boolean): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(ctx, channel)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(ctx).setPriority(if (low) Notification.PRIORITY_LOW else Notification.PRIORITY_HIGH)
        }

    /** Muestra, cambia o quita la notificación en curso según el reloj. */
    fun show(ctx: Context, st: TimerState, now: Long) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (st.status != TimerState.RUNNING && st.status != TimerState.PAUSED) {
            nm.cancel(ID_ONGOING)
            return
        }
        if (!canNotify(ctx)) return
        val t = TimerStore.texts(ctx)
        ensureChannels(ctx, t)
        val b = builder(ctx, CHANNEL_TIMER, true)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(t.mode(st.mode))
            .setContentIntent(openApp(ctx))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(ACCENT)
        companion(ctx, st.companion)?.let { b.setLargeIcon(it) }
        if (st.status == TimerState.RUNNING) {
            b.setContentText(t.phrase(st))
                .setShowWhen(true)
                .setWhen(st.endAt)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(max(1000L, st.endAt - now))
            b.addAction(action(ctx, R.drawable.fp_ic_pause, t.pause, TimerActionReceiver.ACTION_TOGGLE))
        } else {
            b.setContentText(t.paused + " · " + clock(st.remainingMs))
                .setShowWhen(false)
                .setUsesChronometer(false)
            b.addAction(action(ctx, R.drawable.fp_ic_play, t.resume, TimerActionReceiver.ACTION_TOGGLE))
        }
        b.addAction(action(ctx, R.drawable.fp_ic_next, t.skip, TimerActionReceiver.ACTION_SKIP))
        if (st.canFinish && st.mode == TimerState.STUDY) {
            b.addAction(action(ctx, R.drawable.fp_ic_check, t.finish, TimerActionReceiver.ACTION_FINISH))
        }
        nm.notify(ID_ONGOING, b.build())
    }

    /** El aviso del final (con la app cerrada o en segundo plano). */
    fun showEnd(ctx: Context, st: TimerState) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (!canNotify(ctx)) return
        val t = TimerStore.texts(ctx)
        ensureChannels(ctx, t)
        val b = builder(ctx, CHANNEL_ALERT, false)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(t.endTitle(st.mode))
            .setContentText(t.endBody(st.mode))
            .setContentIntent(openApp(ctx))
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(ACCENT)
        if (Build.VERSION.SDK_INT < 26) {
            @Suppress("DEPRECATION")
            b.setDefaults(Notification.DEFAULT_ALL)
        }
        nm.cancel(ID_ONGOING)
        nm.notify(ID_END, b.build())
    }

    // ------------------------------------------------------------------ piezas

    private fun action(ctx: Context, icon: Int, title: String, action: String): Notification.Action =
        Notification.Action.Builder(Icon.createWithResource(ctx, icon), title, TimerActionReceiver.pending(ctx, action)).build()

    /** Tocar la notificación (o la hora del widget) abre FrostPom. */
    fun openApp(ctx: Context): PendingIntent {
        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return PendingIntent.getActivity(ctx, 4300, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** El ícono pequeño de la app (android-recursos: ic_stat_frostpom) o el del complemento. */
    fun smallIcon(ctx: Context): Int {
        val id = ctx.resources.getIdentifier("ic_stat_frostpom", "drawable", ctx.packageName)
        return if (id != 0) id else R.drawable.fp_ic_hourglass
    }

    /** Tu compañero (del arte de la app: www/assets/companions/<id>.webp), 128 px. */
    fun companion(ctx: Context, id: String): Bitmap? {
        companionCache?.let { if (it.first == id) return it.second }
        val bmp = try {
            ctx.assets.open("public/assets/companions/$id.webp").use { input ->
                BitmapFactory.decodeStream(input)?.let { Bitmap.createScaledBitmap(it, 128, 128, true) }
            }
        } catch (e: Exception) {
            null
        }
        companionCache = id to bmp
        return bmp
    }

    /** 754000 ms → "12:34" (o "1:02:05"). */
    fun clock(ms: Long): String {
        val total = (ms + 999) / 1000
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }
}
