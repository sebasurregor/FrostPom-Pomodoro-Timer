package com.startupprometeus.frostpom.timer

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * FrostPom (v4.6) — lo que el complemento guarda en el teléfono (SharedPreferences privadas de la
 * app): la copia del reloj, los textos en el idioma de la app y los botones tocados que la app
 * todavía no ha aplicado. Nada de esto sale del teléfono.
 */
object TimerStore {
    private const val PREFS = "frostpom_timer"
    private const val KEY_STATE = "state"
    private const val KEY_TEXTS = "texts"
    private const val KEY_PENDING = "pending"
    private const val MAX_PENDING = 50
    private val lock = Any()

    private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(ctx: Context): TimerState = synchronized(lock) {
        val raw = prefs(ctx).getString(KEY_STATE, null)
        if (raw == null) {
            TimerState()
        } else {
            try {
                TimerState.fromJson(JSONObject(raw))
            } catch (e: Exception) {
                TimerState()
            }
        }
    }

    /** Guarda el reloj (y, si llegan, los textos en el idioma de la app). */
    fun save(ctx: Context, st: TimerState, texts: String? = null) {
        synchronized(lock) {
            val e = prefs(ctx).edit().putString(KEY_STATE, st.toJson().toString())
            if (texts != null && texts.length <= 16_000) e.putString(KEY_TEXTS, texts)
            e.apply()
        }
    }

    /** Los textos de la notificación y del widget (con los de res/values como respaldo). */
    fun texts(ctx: Context): Texts {
        val raw = synchronized(lock) { prefs(ctx).getString(KEY_TEXTS, null) }
        val json = try {
            if (raw == null) null else JSONObject(raw)
        } catch (e: Exception) {
            null
        }
        return Texts(ctx, json)
    }

    fun addPending(ctx: Context, a: PendingAction) {
        synchronized(lock) {
            val list = readPending(ctx)
            list.add(a)
            writePending(ctx, list.takeLast(MAX_PENDING))
        }
    }

    fun hasPending(ctx: Context): Boolean = synchronized(lock) { readPending(ctx).isNotEmpty() }

    /** Entrega los botones tocados (en orden) y los olvida. */
    fun takePending(ctx: Context): List<PendingAction> = synchronized(lock) {
        val list = readPending(ctx)
        if (list.isNotEmpty()) writePending(ctx, emptyList())
        list
    }

    private fun readPending(ctx: Context): MutableList<PendingAction> {
        val out = mutableListOf<PendingAction>()
        val raw = prefs(ctx).getString(KEY_PENDING, null) ?: return out
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                PendingAction.fromJson(arr.optJSONObject(i))?.let { out.add(it) }
            }
        } catch (e: Exception) {
            // Algo raro guardado: se descarta
        }
        return out
    }

    private fun writePending(ctx: Context, list: List<PendingAction>) {
        val arr = JSONArray()
        for (a in list) arr.put(a.toJson())
        prefs(ctx).edit().putString(KEY_PENDING, arr.toString()).apply()
    }
}

/**
 * Los textos que manda la app web (js/ui/native-ui.js: nativeTexts), con los de res/values como
 * respaldo (por ejemplo, si pones el widget antes de abrir la app por primera vez).
 */
class Texts(private val ctx: Context, private val json: JSONObject?) {
    private fun pick(path: String, fallback: Int): String {
        var node: Any? = json
        for (part in path.split('.')) {
            node = (node as? JSONObject)?.opt(part)
        }
        val s = (node as? String)?.trim().orEmpty()
        return if (s.isNotEmpty() && s.length <= 300) s else ctx.getString(fallback)
    }

    fun mode(mode: String): String = when (mode) {
        TimerState.STUDY -> pick("modes.study", R.string.fp_mode_study)
        TimerState.LONG -> pick("modes.long", R.string.fp_mode_long)
        else -> pick("modes.break", R.string.fp_mode_break)
    }

    /** La frase debajo de la hora. */
    fun phrase(st: TimerState): String = when {
        st.status == TimerState.DONE -> pick("done", R.string.fp_done)
        st.status == TimerState.PAUSED -> paused
        st.mode == TimerState.STUDY && st.status == TimerState.RUNNING -> pick("phrases.study", R.string.fp_phrase_study)
        st.mode == TimerState.STUDY -> pick("phrases.studyIdle", R.string.fp_phrase_study_idle)
        st.status == TimerState.RUNNING -> pick("phrases.break", R.string.fp_phrase_break)
        else -> pick("phrases.breakIdle", R.string.fp_phrase_break_idle)
    }

    fun bubble(mode: String): String =
        if (mode == TimerState.STUDY) pick("bubble.study", R.string.fp_bubble_study) else pick("bubble.break", R.string.fp_bubble_break)

    val paused: String get() = pick("paused", R.string.fp_paused)
    val start: String get() = pick("start", R.string.fp_start)
    val pause: String get() = pick("pause", R.string.fp_pause)
    val resume: String get() = pick("resume", R.string.fp_resume)
    val skip: String get() = pick("skip", R.string.fp_skip)
    val finish: String get() = pick("finish", R.string.fp_finish)
    val reset: String get() = pick("reset", R.string.fp_reset)

    fun endTitle(mode: String): String =
        if (mode == TimerState.STUDY) pick("endStudy.title", R.string.fp_end_study_title) else pick("endBreak.title", R.string.fp_end_break_title)

    fun endBody(mode: String): String =
        if (mode == TimerState.STUDY) pick("endStudy.body", R.string.fp_end_study_body) else pick("endBreak.body", R.string.fp_end_break_body)

    val channel: String get() = pick("channel", R.string.fp_channel_timer)
    val channelDesc: String get() = pick("channelDesc", R.string.fp_channel_timer_desc)
}
