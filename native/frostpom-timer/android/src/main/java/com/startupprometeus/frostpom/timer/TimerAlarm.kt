package com.startupprometeus.frostpom.timer

import android.app.AlarmManager
import android.content.Context
import android.os.Build

/**
 * FrostPom (v4.6) — el aviso del final y la actualización del widget cada 15 min.
 *
 *  - Con el permiso "Alarmas y recordatorios" (SCHEDULE_EXACT_ALARM) el aviso es exacto. Desde
 *    Android 14 viene apagado: la app lo pide UNA vez, con una explicación (native-ui.js).
 *  - Sin él, llega en una ventana de pocos minutos (setAndAllowWhileIdle), como en la v4.5.
 *  - No se usa USE_EXACT_ALARM: Google Play solo lo permite a despertadores y calendarios.
 */
object TimerAlarm {
    fun canExact(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return false
        return am.canScheduleExactAlarms()
    }

    fun scheduleEnd(ctx: Context, at: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_END)
        try {
            if (canExact(ctx)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun cancelEnd(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_END))
    }

    /** Sin despertar al teléfono: si está dormido, el widget se pone al día cuando despierte. */
    fun scheduleTick(ctx: Context, at: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.set(AlarmManager.RTC, at, TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_TICK))
    }

    fun cancelTick(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_TICK))
    }
}
