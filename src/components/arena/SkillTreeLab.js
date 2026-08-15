"use client";

import SkillTree from "@/components/arena/SkillTree";
import { baseState } from "@/components/arena/arena-lab-fixtures";

// The tree against the arena lab's own fixture state, so the classes, nodes, ranks and gates are the real
// catalog rather than invented ones. `onAct` is a no-op: nothing in the lab should spend a point.
export default function SkillTreeLab() {
    const st = baseState();
    return (
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 12 }}>
            <SkillTree progress={st.progress} gold={st.gold || 0} busy={false} onAct={() => {}} />
        </main>
    );
}
