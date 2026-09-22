import { useCallback, useState } from 'react'
import { TooltipShell } from './ItemTooltip'
import './SkillTooltip.css'

/**
 * The skill tooltip, for the player's own skills and for anyone else's.
 *
 * It lived inside SkillsPanel, so a profile could only manage a browser `title`
 * attribute: a name, a level and a bare XP total in the OS font. Same shell and
 * chrome as the item tooltip, because there is no reason a skill should look
 * like a different game to a hide.
 */

export interface TooltipSkill {
    name: string
    level: number
    xp: number
    progress?: number
    description?: string
    /** Into the current level, and how long that level is. Both from the server. */
    xpIntoLevel?: number
    xpLevelSpan?: number
}

const fmt = (n: number) => n.toLocaleString('en-US')

interface SkillTooltipProps {
    x: number
    y: number
    skill: TooltipSkill
    /** Another player's skills. Changes the total's wording, nothing else. */
    possessive?: string | null
}

export default function SkillTooltip({ x, y, skill, possessive }: SkillTooltipProps) {
    const progress = skill.progress ?? 0
    return (
        <TooltipShell x={x} y={y} width={240} height={150}>
            <div className="skill-tooltip-head">
                <span className="item-tooltip-name">{skill.name}</span>
                <span className="skill-tooltip-level tabular-num">Level {skill.level}</span>
            </div>
            {skill.description && <p className="item-tooltip-desc">{skill.description}</p>}
            {/* Numbers, not just a percentage. "62% to next level" never said
                whether that was an evening or a fortnight. */}
            <div className="skill-tooltip-progress tabular-num">
                {skill.xpLevelSpan
                    ? <>{fmt(skill.xpIntoLevel ?? 0)} / {fmt(skill.xpLevelSpan)} XP to level {skill.level + 1}</>
                    : <>{progress}% to next level</>}
            </div>
            <div className="skill-tooltip-bar">
                <div
                    className="skill-tooltip-bar-fill"
                    style={{ width: `${Math.min(100, progress)}%` }}
                />
            </div>
            <p className="item-tooltip-hint tabular-num">
                {fmt(skill.xp)} XP earned {possessive ? `by ${possessive}` : 'in total'}
            </p>
        </TooltipShell>
    )
}

/**
 * Attach the skill tooltip to anything.
 *
 *   const { hoverProps, tooltipEl } = useSkillTooltip()
 *   <div {...hoverProps(skill)} />
 *   {tooltipEl}
 */
export function useSkillTooltip(possessive?: string | null) {
    const [state, setState] = useState<{ x: number; y: number; skill: TooltipSkill } | null>(null)

    const hoverProps = useCallback((skill: TooltipSkill | null | undefined) => {
        if (!skill?.name) return {}
        const show = (e: { clientX: number; clientY: number }) => {
            setState({ x: e.clientX, y: e.clientY, skill })
        }
        return {
            onMouseEnter: show,
            onMouseMove: show,
            onMouseLeave: () => setState(null),
        }
    }, [])

    const tooltipEl = state
        ? <SkillTooltip x={state.x} y={state.y} skill={state.skill} possessive={possessive} />
        : null

    return { hoverProps, tooltipEl }
}
