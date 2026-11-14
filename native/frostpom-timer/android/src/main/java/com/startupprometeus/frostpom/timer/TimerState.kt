package com.startupprometeus.frostpom.timer

import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

/**
 * FrostPom (v4.6) — la copia nativa del reloj.
 *
 * La app web le cuenta al teléfono cómo está el reloj (FrostTimerPlugin.update) y el teléfono
 * guarda esta copia para la notificación en curso, el widget y el aviso del final. Si tocas un
 * botón con la app cerrada, esta copia cambia al instante y la acción queda anotada
 * (PendingAction) para que la app web la aplique, con su hora, cuando se abra.
 *
 * Funciones puras (sin Android): se pueden probar con JUnit sin emulador.
 */
data class TimerState(
    val status: String = IDLE, // idle | running | paused | done (done = llegó a cero y falta abrir la app)
    val mode: String = STUDY, // study | break | long
    val durationSec: Int = 25 * 60,
    val endAt: Long = 0L, // corriendo: hora del fin (ms, reloj del teléfono)
    val remainingMs: Long = 25 * 60_000L, // en pausa o en reposo: lo que falta
    val block: String = "", // el número del bloque (lo pone la app web)
    val canFinish: Boolean = false, // "Terminar y guardar" (solo estudio, con algo hecho)
    val studySec: Int = 25 * 60,
    val breakSec: Int = 5 * 60,
    val longSec: Int = 15 * 60,
    val companion: String = "pinguino",
    val theme: String = "auto", // auto | light | dark
    val doneMode: String = "", // con status = done: el modo que terminó
) {
    /** Lo que falta (ms) a la hora now. */
    fun remainingAt(now: Long): Long = if (status == RUNNING) max(0L, endAt - now) else max(0L, remainingMs)

    /** Lo hecho (ms) a la hora now. */
    fun elapsedAt(now: Long): Long = max(0L, durationSec * 1000L - remainingAt(now))

    /** Avance del bloque, de 0 a 1. */
    fun progressAt(now: Long): Float =
        if (durationSec <= 0 || status == IDLE) 0f else min(1f, elapsedAt(now).toFloat() / (durationSec * 1000f))

    fun durationFor(m: String): Int = when (m) {
        STUDY -> studySec
        LONG -> longSec
        else -> breakSec
    }

    // ------------------------------------------------------------------ acciones
    // Cada una devuelve el estado nuevo, o null si no aplica (por ejemplo, pausar algo en pausa).

    fun pause(now: Long): TimerState? =
        if (status != RUNNING) null else copy(status = PAUSED, remainingMs = max(0L, endAt - now), endAt = 0L)

    fun resume(now: Long): TimerState? =
        if (status != PAUSED) null else copy(status = RUNNING, endAt = now + remainingMs)

    fun start(now: Long): TimerState? =
        if (status != IDLE) null
        else copy(status = RUNNING, endAt = now + durationSec * 1000L, remainingMs = 0L, block = "", canFinish = mode == STUDY)

    /** Saltar: lo siguiente, en reposo (después del estudio, descanso; después del descanso, estudio). */
    fun skip(): TimerState? {
        if (status == DONE) return null
        val next = if (mode == STUDY) BREAK else STUDY
        val d = durationFor(next)
        return copy(status = IDLE, mode = next, durationSec = d, endAt = 0L, remainingMs = d * 1000L, block = "", canFinish = false)
    }

    /** Reiniciar: el mismo bloque, desde el principio y en reposo. */
    fun reset(): TimerState? =
        if (status != RUNNING && status != PAUSED) null
        else copy(status = IDLE, endAt = 0L, remainingMs = durationSec * 1000L, block = "", canFinish = false)

    /** "Terminar y guardar": solo estudio y con al menos 1 minuto hecho (como en la app). */
    fun finish(now: Long): TimerState? {
        if (mode != STUDY || (status != RUNNING && status != PAUSED) || elapsedAt(now) < MIN_SAVE_MS) return null
        val d = durationFor(BREAK)
        return copy(status = IDLE, mode = BREAK, durationSec = d, endAt = 0L, remainingMs = d * 1000L, block = "", canFinish = false)
    }

    /** Llegó a cero: queda esperando a que la app guarde el bloque. */
    fun done(): TimerState = copy(status = DONE, doneMode = mode, endAt = 0L, remainingMs = 0L, canFinish = false)

    fun toJson(): JSONObject = JSONObject()
        .put("status", status)
        .put("mode", mode)
        .put("durationSec", durationSec)
        .put("endAt", endAt)
        .put("remainingMs", remainingMs)
        .put("block", block)
        .put("canFinish", canFinish)
        .put("studySec", studySec)
        .put("breakSec", breakSec)
        .put("longSec", longSec)
        .put("companion", companion)
        .put("theme", theme)
        .put("doneMode", doneMode)

    companion object {
        const val IDLE = "idle"
        const val RUNNING = "running"
        const val PAUSED = "paused"
        const val DONE = "done"
        const val STUDY = "study"
        const val BREAK = "break"
        const val LONG = "long"
        const val MIN_SAVE_MS = 60_000L
        private const val MIN_SEC = 60
        private const val MAX_SEC = 3 * 60 * 60

        private val STATUSES = setOf(IDLE, RUNNING, PAUSED, DONE)
        private val MODES = setOf(STUDY, BREAK, LONG)
        private val BLOCK_RE = Regex("^[A-Za-z0-9-]{8,64}$")
        private val COMPANION_RE = Regex("^[a-z-]{1,32}$")

        private fun sec(v: Int, fallback: Int): Int = if (v in MIN_SEC..MAX_SEC) v else fallback

        /**
         * Lee un estado (de la app web o de lo guardado), revisando cada campo: lo que no sirve
         * vuelve a su valor por defecto. Nunca lanza errores.
         */
        fun fromJson(o: JSONObject?): TimerState {
            if (o == null) return TimerState()
            val d = TimerState()
            val status = o.optString("status", IDLE).takeIf { it in STATUSES } ?: IDLE
            val mode = o.optString("mode", STUDY).takeIf { it in MODES } ?: STUDY
            val durations = o.optJSONObject("durations")
            val studySec = sec(durations?.optInt("study", o.optInt("studySec")) ?: o.optInt("studySec"), d.studySec)
            val breakSec = sec(durations?.optInt("break", o.optInt("breakSec")) ?: o.optInt("breakSec"), d.breakSec)
            val longSec = sec(durations?.optInt("long", o.optInt("longSec")) ?: o.optInt("longSec"), d.longSec)
            val durationSec = sec(o.optInt("durationSec"), d.durationSec)
            val endAt = max(0L, o.optLong("endAt"))
            val remainingMs = min(max(0L, o.optLong("remainingMs", durationSec * 1000L)), MAX_SEC * 1000L)
            val block = o.optString("block", "").takeIf { BLOCK_RE.matches(it) } ?: ""
            val companion = o.optString("companion", d.companion).takeIf { COMPANION_RE.matches(it) } ?: d.companion
            val theme = o.optString("theme", "auto").takeIf { it == "light" || it == "dark" } ?: "auto"
            val doneMode = o.optString("doneMode", "").takeIf { it in MODES } ?: ""
            // Corriendo sin hora de fin no tiene sentido: queda en reposo
            val fixedStatus = if (status == RUNNING && endAt <= 0L) IDLE else status
            return TimerState(
                status = fixedStatus,
                mode = mode,
                durationSec = durationSec,
                endAt = if (fixedStatus == RUNNING) endAt else 0L,
                remainingMs = remainingMs,
                block = block,
                canFinish = o.optBoolean("canFinish", false) && mode == STUDY && (fixedStatus == RUNNING || fixedStatus == PAUSED),
                studySec = studySec,
                breakSec = breakSec,
                longSec = longSec,
                companion = companion,
                theme = theme,
                doneMode = doneMode,
            )
        }
    }
}

/** Un botón tocado en la notificación o en el widget, con su hora (ms) y el bloque que había. */
data class PendingAction(val act: String, val at: Long, val block: String) {
    fun toJson(): JSONObject = JSONObject().put("act", act).put("at", at).put("block", block)

    companion object {
        val ACTS = setOf("start", "pause", "resume", "skip", "reset", "finish")

        fun fromJson(o: JSONObject?): PendingAction? {
            if (o == null) return null
            val act = o.optString("act", "")
            val at = o.optLong("at", 0L)
            if (act !in ACTS || at <= 0L) return null
            return PendingAction(act, at, o.optString("block", ""))
        }
    }
}
