package com.startupprometeus.frostpom.timer

import android.app.AlarmManager
import android.content.Context
import android.os.Build

/**
 * FrostPom (v4.6) — el aviso del final y la actualización del widget cada 2 min (v4.7.3).
 *
 *  - Con el permiso "Alarmas y recordatorios" (SCHEDULE_EXACT_ALARM) el aviso es exacto. Desde
 *    Android 14 viene apagado: la app lo pide UNA vez, con una explicación (native-ui.js), al
 *    empezar el primer pomodoro (v4.7.3).
 *  - Sin él, Android puede atrasar el aviso hasta un 75 % de lo que falta (en un pomodoro de
 *    25 min, ¡hasta 18 min!). (v4.7.3) Por eso se programan "alarmas de acercamiento" a la mitad
 *    de lo que falta: cada una vuelve a programar el aviso, y como ya falta menos, Android le da
 *    menos margen. Al final llega con ~1 min de retraso como mucho (4 o 5 despertadas por bloque).
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
        var exact = canExact(ctx)
        try {
            if (exact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: SecurityException) {
            exact = false
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
        scheduleApproach(ctx, am, if (exact) 0L else at)
    }

    /** (v4.7.3) Sin alarmas exactas: otra alarma a la mitad de lo que falta, que reprograma el aviso. */
    private fun scheduleApproach(ctx: Context, am: AlarmManager, end: Long) {
        val pi = TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_APPROACH)
        val left = end - System.currentTimeMillis()
        if (end <= 0L || left <= APPROACH_MIN_MS) {
            am.cancel(pi)
            return
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end - left / 2, pi)
    }

    fun cancelEnd(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_END))
        am.cancel(TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_APPROACH))
    }

    /**
     * Sin despertar al teléfono: si está dormido, el widget y el reproductor se ponen al día cuando
     * despierte. (v4.7.3) Exacta si hay permiso (las aproximadas llegaban hasta 8 min tarde).
     */
    fun scheduleTick(ctx: Context, at: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_TICK)
        try {
            if (canExact(ctx)) am.setExact(AlarmManager.RTC, at, pi) else am.set(AlarmManager.RTC, at, pi)
        } catch (e: SecurityException) {
            am.set(AlarmManager.RTC, at, pi)
        }
    }

    fun cancelTick(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(TimerActionReceiver.pending(ctx, TimerActionReceiver.ACTION_TICK))
    }

    /** Con menos de 90 s por delante ya no hace falta acercarse más (Android da ≤ 1 min de margen). */
    private const val APPROACH_MIN_MS = 90_000L
}
