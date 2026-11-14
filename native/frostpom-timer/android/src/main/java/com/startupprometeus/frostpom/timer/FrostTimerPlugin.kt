package com.startupprometeus.frostpom.timer

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * FrostPom (v4.6) — el complemento "FrostTimer": lo que la app web le pide al teléfono.
 * La parte web está en js/native.js (timerUpdate, takeTimerActions…) y js/ui/native-ui.js.
 *
 *  - update(estado): la notificación en curso, el widget y el aviso del final se ponen al día.
 *  - getPendingActions(): los botones tocados en la notificación o el widget (y los olvida).
 *  - canScheduleExactAlarms() / openExactAlarmSettings(): el permiso "Alarmas y recordatorios".
 *  - Evento "actionsPending": avisa a la app abierta que tocaste un botón.
 */
@CapacitorPlugin(name = "FrostTimer")
class FrostTimerPlugin : Plugin() {

    override fun load() {
        current = this
        inForeground = true
    }

    override fun handleOnResume() {
        super.handleOnResume()
        inForeground = true
    }

    override fun handleOnPause() {
        super.handleOnPause()
        inForeground = false
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        if (current === this) current = null
        inForeground = false
    }

    @PluginMethod
    fun update(call: PluginCall) {
        try {
            val ctx = context
            val next = TimerState.fromJson(call.data)
            val texts = call.getObject("texts")?.toString()
            if (TimerStore.hasPending(ctx)) {
                // Hay botones tocados que la app todavía no aplicó: el reloj de aquí es el bueno.
                // Se guardan solo los textos y las duraciones, y se le recuerda a la app.
                val mine = TimerStore.load(ctx)
                TimerStore.save(ctx, mine.copy(studySec = next.studySec, breakSec = next.breakSec, longSec = next.longSec, companion = next.companion, theme = next.theme), texts)
                emitActions()
            } else {
                TimerStore.save(ctx, next, texts)
            }
            TimerEngine.refresh(ctx)
            call.resolve()
        } catch (e: Exception) {
            Log.w(TAG, "update", e)
            call.reject("No se pudo actualizar el reloj del teléfono", e)
        }
    }

    @PluginMethod
    fun getPendingActions(call: PluginCall) {
        val arr = JSArray()
        try {
            for (a in TimerStore.takePending(context)) arr.put(a.toJson())
        } catch (e: Exception) {
            Log.w(TAG, "getPendingActions", e)
        }
        val ret = JSObject()
        ret.put("actions", arr)
        call.resolve(ret)
    }

    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        val ret = JSObject()
        ret.put("value", TimerAlarm.canExact(context))
        call.resolve(ret)
    }

    @PluginMethod
    fun openExactAlarmSettings(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "openExactAlarmSettings", e)
        }
        call.resolve()
    }

    /** Le avisa a la app web (si está abierta) que hay botones tocados por aplicar. */
    fun emitActions() {
        notifyListeners("actionsPending", JSObject())
    }

    companion object {
        private const val TAG = "FrostTimer"

        /** El complemento de la app abierta (o null si la app no está corriendo). */
        @Volatile
        var current: FrostTimerPlugin? = null

        /** ¿La app está a la vista? (Entonces ella misma avisa del final.) */
        @Volatile
        var inForeground: Boolean = false

        fun actionsPending() {
            try {
                current?.emitActions()
            } catch (e: Exception) {
                Log.w(TAG, "actionsPending", e)
            }
        }
    }
}
