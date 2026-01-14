// Reusable mapping utilities for interactions -> input categories
// Diese Datei exportiert eine konstante Map und Hilfsfunktionen, damit andere Teile
// der App (execute-training, gameplay, select-training) dieselbe Zuordnung verwenden.

import type { Command } from './mediapipeController'

export type InputType = 'movement' | 'rotation' | 'drop'

// Zuordnung bekannter Interaktions-IDs zu Input-Kategorien
const INTERACTION_TO_INPUT: Record<string, InputType> = {
    // movement-like interactions
    'lean': 'movement',
    'step': 'movement',
    'squat': 'movement',
    'jump': 'movement',
    'raise-foot': 'movement',

    // rotation-like interactions
    'raise-hand': 'rotation',
    'raise-both-hands': 'rotation',
    'rotate-fast': 'rotation',

    // drop-like interactions (explicit drop gesture)
    'drop': 'drop',
    'raise-both': 'drop',
}

export function interactionToInput(interaction: string): InputType | null {
    if (!interaction) return null
    const key = interaction.trim().toLowerCase()
    if (INTERACTION_TO_INPUT[key]) return INTERACTION_TO_INPUT[key]
    // fallback heuristics
    if (key.includes('raise') && key.includes('both')) return 'drop'
    if (key.includes('raise') || key.includes('rotate') || key.includes('hand')) return 'rotation'
    if (key.includes('step') || key.includes('lean') || key.includes('jump') || key.includes('squat') || key.includes('foot')) return 'movement'
    return null
}

// Wenn localStorage ein Objekt enthält, das entweder:
//  - schon { inputType: [interactionId, ...], ... } ist, oder
//  - eine flache Liste von interactionIds (Array)
// ist dieses Hilfsfunktion robust und liefert eine array von {input, interaction}
export function buildSequenceFromSelected(selected: any): { input: InputType; interaction: string }[] {
    const out: { input: InputType; interaction: string }[] = []
    if (!selected) return out

    // Wenn selected bereits ein Objekt mit input keys ist
    if (typeof selected === 'object' && !Array.isArray(selected)) {
        // try to detect whether keys are inputs or interaction ids
        const keys = Object.keys(selected)
        const firstKey = keys[0]
        if (firstKey === 'movement' || firstKey === 'rotation' || firstKey === 'drop') {
            for (const inputKey of keys) {
                const arr = selected[inputKey]
                if (Array.isArray(arr)) {
                    for (const inter of arr) {
                        out.push({ input: inputKey as InputType, interaction: String(inter) })
                    }
                }
            }
            return out
        }
    }

    // If selected is an array (list of interactions) or object with unknown keys,
    // normalize to array of interaction ids and map them to inputs
    let interactions: string[] = []
    if (Array.isArray(selected)) {
        interactions = selected.map(s => String(s))
    } else if (typeof selected === 'object') {
        // maybe it's an object whose values are booleans or similar
        for (const k of Object.keys(selected)) {
            const v = selected[k]
            if (v) interactions.push(k)
        }
    } else if (typeof selected === 'string') {
        try {
            const parsed = JSON.parse(selected)
            return buildSequenceFromSelected(parsed)
        } catch (_) {
            // treat string as single interaction id
            interactions = [selected]
        }
    }

    for (const inter of interactions) {
        const input = interactionToInput(inter)
        if (input) out.push({ input, interaction: inter })
    }
    return out
}



export type GameAction =
    | { type: 'none' }
    | { type: 'move'; column: number }
    | { type: 'step'; delta: -1 | 1 }
    | { type: 'rotate'; direction: 'clockwise' | 'counterclockwise' }
    | { type: 'drop' }

// Handler registry: per-interaction function that maps Command -> GameAction
export type InteractionHandler = (cmd: Command, cols?: number) => GameAction

const HANDLERS: Record<string, InteractionHandler> = {}

// default helpers
const hipXToCol = (cmd: Command, cols: number) => {
    const hipX = (cmd.hipX ?? 0.5)
    let col = cols - 1 - Math.floor(hipX * cols)
    return Math.max(0, Math.min(cols - 1, col))
}

// Register default handlers
// lean: discrete one-column steps when user leans left/right; neutral produces no continuous movement
HANDLERS['lean'] = (cmd, _cols = 10) => {
    if ((cmd as any).leanLeft) return { type: 'step', delta: -1 }
    if ((cmd as any).leanRight) return { type: 'step', delta: 1 }
    return { type: 'none' }
}

// step / raise-foot: continuous mapping from torso X to column (useful for walking/stepping interactions)
HANDLERS['step'] = (cmd, cols = 10) => ({ type: 'move', column: hipXToCol(cmd, cols) })
HANDLERS['raise-foot'] = HANDLERS['step'] //TODO: is rotation, not movement

// squat/jump: common choices for 'drop' gestures — map to drop when detected
HANDLERS['squat'] = (cmd) => {
    return cmd.squat ? { type: 'drop' } : { type: 'none' }
}
HANDLERS['jump'] = (cmd) => {
    // treat a jump as a discrete drop trigger as a sensible default
    return (cmd as any).jumpDetected ? { type: 'drop' } : { type: 'none' }
}

// rotate with single-hand raises
HANDLERS['raise-hand'] = (cmd) => {
    if (cmd.leftHandUp && !cmd.rightHandUp) return { type: 'rotate', direction: 'counterclockwise' }
    if (cmd.rightHandUp && !cmd.leftHandUp) return { type: 'rotate', direction: 'clockwise' }
    return { type: 'none' }
}

// both-hands / drop gestures
HANDLERS['raise-both-hands'] = (cmd) => ({ type: cmd.bothHandsUp ? 'drop' : 'none' })
HANDLERS['raise-both'] = HANDLERS['raise-both-hands']
HANDLERS['drop'] = (cmd) => ({ type: cmd.bothHandsUp ? 'drop' : 'none' })

// Public API to register a custom handler
export function registerInteractionHandler(interactionId: string, handler: InteractionHandler) {
    HANDLERS[interactionId.toLowerCase()] = handler
}

export function getInteractionHandler(interactionId: string | null): InteractionHandler | null {
    if (!interactionId) return null
    const key = interactionId.toLowerCase()
    return HANDLERS[key] ?? null
}

// Modify mapCommandToAction to defer to specific handler if available
export function mapCommandToAction(interaction: string | null, cmd: Command, cols = 10): GameAction {
    if (!interaction) return { type: 'none' }
    const key = interaction.trim().toLowerCase()
    const handler = getInteractionHandler(key)
    if (handler) return handler(cmd, cols)

    // fallback to previous heuristic logic
    const input = interactionToInput(key) || 'movement'
    const hipX = typeof cmd.hipX === 'number' ? cmd.hipX : 0.5
    let col = cols - 1 - Math.floor(hipX * cols)
    col = Math.max(0, Math.min(cols - 1, col))

    if (input === 'movement') return { type: 'move', column: col }
    if (input === 'rotation') {
        if (cmd.leftHandUp && !cmd.rightHandUp) return { type: 'rotate', direction: 'counterclockwise' }
        if (cmd.rightHandUp && !cmd.leftHandUp) return { type: 'rotate', direction: 'clockwise' }
        return { type: 'none' }
    }
    if (input === 'drop') return cmd.bothHandsUp ? { type: 'drop' } : { type: 'none' }
    return { type: 'none' }
}
