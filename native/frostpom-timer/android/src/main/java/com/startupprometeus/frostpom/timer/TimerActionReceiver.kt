package com.startupprometeus.frostpom.timer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * FrostPom (v4.6) — los botones de la notificación y del widget, el aviso del final y la
 * actualización cada 15 min. Funciona aunque la app esté cerrada (no se abre nada).
 * No es "exported": solo FrostPom puede enviarle estas acciones.
 */
class TimerActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val now = System.currentTimeMillis()
        try {
            when (intent.action) {
                ACTION_TOGGLE -> TimerEngine.act(context, "toggle", now)
                ACTION_SKIP -> TimerEngine.act(context, "skip", now)
                ACTION_FINISH -> TimerEngine.act(context, "finish", now)
                ACTION_RESET -> TimerEngine.act(context, "reset", now)
                ACTION_END -> TimerEngine.ended(context, now)
                ACTION_TICK -> TimerEngine.refresh(context, now)
            }
        } catch (e: Exception) {
            Log.w("FrostTimer", "onReceive ${intent.action}", e)
        }
    }

    companion object {
        private const val PREFIX = "com.startupprometeus.frostpom.timer."
        const val ACTION_TOGGLE = PREFIX + "TOGGLE"
        const val ACTION_SKIP = PREFIX + "SKIP"
        const val ACTION_FINISH = PREFIX + "FINISH"
        const val ACTION_RESET = PREFIX + "RESET"
        const val ACTION_END = PREFIX + "END"
        const val ACTION_TICK = PREFIX + "TICK"

        private val CODES = mapOf(
            ACTION_TOGGLE to 4401,
            ACTION_SKIP to 4402,
            ACTION_FINISH to 4403,
            ACTION_RESET to 4404,
            ACTION_END to 4405,
            ACTION_TICK to 4406,
        )

        /** El PendingIntent de cada acción (uno distinto por acción, inmutable). */
        fun pending(ctx: Context, action: String): PendingIntent {
            val intent = Intent(ctx, TimerActionReceiver::class.java).setAction(action)
            return PendingIntent.getBroadcast(ctx, CODES[action] ?: 4400, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}

/**
 * Al reiniciar el teléfono (o al actualizar la app) vuelven la notificación y el aviso del final.
 * Si el bloque terminó mientras el teléfono estaba apagado, llega el aviso.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        try {
            TimerEngine.refresh(context)
        } catch (e: Exception) {
            Log.w("FrostTimer", "boot", e)
        }
    }
}
