package com.startupprometeus.frostpom.timer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pruebas de la copia nativa del reloj (sin emulador): `gradlew :frostpom-timer:testDebugUnitTest`.
 * Ojo: org.json en las pruebas de JVM necesita Robolectric o la dependencia "org.json:json"; por eso
 * aquí solo se prueba la lógica (TimerState sin JSON).
 */
class TimerStateTest {
    private val t0 = 1_800_000_000_000L
    private val idle = TimerState(status = TimerState.IDLE, mode = TimerState.STUDY, durationSec = 1500, remainingMs = 1_500_000)

    @Test
    fun empezarPausarYContinuar() {
        val run = idle.start(t0)!!
        assertEquals(TimerState.RUNNING, run.status)
        assertEquals(t0 + 1_500_000, run.endAt)
        assertTrue(run.canFinish)
        val paused = run.pause(t0 + 60_000)!!
        assertEquals(1_440_000, paused.remainingMs)
        assertNull("pausar algo en pausa no hace nada", paused.pause(t0 + 70_000))
        val again = paused.resume(t0 + 120_000)!!
        assertEquals(t0 + 120_000 + 1_440_000, again.endAt)
    }

    @Test
    fun terminarYGuardarNecesitaUnMinuto() {
        val run = idle.start(t0)!!
        assertNull(run.finish(t0 + 30_000))
        val done = run.finish(t0 + 90_000)!!
        assertEquals(TimerState.IDLE, done.status)
        assertEquals(TimerState.BREAK, done.mode)
        assertEquals(done.breakSec * 1000L, done.remainingMs)
    }

    @Test
    fun saltarYReiniciar() {
        val brk = idle.skip()!!
        assertEquals(TimerState.BREAK, brk.mode)
        assertEquals(TimerState.STUDY, brk.skip()!!.mode)
        val run = idle.start(t0)!!
        val reset = run.reset()!!
        assertEquals(TimerState.IDLE, reset.status)
        assertEquals(1_500_000, reset.remainingMs)
        assertNull("reiniciar en reposo no hace nada", idle.reset())
    }

    @Test
    fun alLlegarACero() {
        val done = idle.start(t0)!!.done()
        assertEquals(TimerState.DONE, done.status)
        assertEquals(TimerState.STUDY, done.doneMode)
        assertNull("con el bloque terminado no se salta: hay que abrir la app", done.skip())
        assertEquals(1f, idle.start(t0)!!.progressAt(t0 + 2_000_000), 0.0001f)
    }
}
