Below is a short product requirements document, split into sections to keep things clear. After that, you'll find 5 Git tickets that break down the changes we need, plus the exact commands and code diffs to bring everything to life.

---

## 1. Product Requirements Document

### Purpose
We want a simple game that demonstrates how autonomous agents (powered by Large Language Models, or LLMs) can drive behavior inside a 2D world. By “autonomous agent,” we mean each agent uses some AI logic to decide how it moves and interacts with the environment, creating interesting, even surprising, emergent play.

### High-Level Concept
- **Game Name**: "Swarm City"
- **Core Mechanic**: Let’s populate a top-down 2D environment with little “bots.” Each bot has a small handful of simple “actions,” like moving around, gathering items, and socializing with other bots. Behind the scenes, each bot is powered by a hidden LLM prompt that decides what to do next based on the game state.
- **Win Condition**: This game won’t have a typical “winning” state. Instead, the fun is seeing how the bots evolve patterns and behaviors over time—and possibly cause emergent outcomes (like one bot leading a “gang” or forming a trading circle).
- **Viral or Emergent Potential**: 
  - Agents can form groups, gather resources, and spend them. 
  - Over time, new patterns might emerge: agent factions, alliances, or even “trading economies.” 
  - Because each LLM agent is slightly unpredictable, the game could go in surprising directions, which players can watch or even nudge along.

### Feature Breakdown

1. **2D World**: A minimal tile-based environment—like a small city grid or a patch of farmland. 
2. **Bots/Agents**: 
   - Each is an LLM instance with a limited set of “tools” (move, gather, talk, trade).
   - The prompt behind each agent is simple: “You want to gather items, trade with neighbors, and chat with them if they approach. If you see a stockpile of items, consider picking them up.” (We can tweak this prompt to see what emerges.)
3. **Basic Interaction**:
   - Agents move around randomly at first, but can also “ask” the environment if there’s anything to pick up.
   - Agents may “drop” items or “offer trades” to others. These trades are done automatically by exchanging messages behind the scenes.
4. **Player Interaction** (MVP):
   - The player just watches the swarm. Possibly we give the player a single ability: to spawn new items or a new agent. 
   - The novelty is seeing how bots gather and trade.

### MVP Scope
- Minimal environment (a single map).
- A few items scattered around.
- Simple autonomy for bots: each has a single prompt that instructs them on how to handle the environment, plus a handful of “tools.”
- A basic debug UI that shows each bot’s “thought” in text form (optional in MVP, but helpful if we want to see how it’s thinking).
- Everything runs in the browser, thanks to Next.js and Phaser.

### Risks & Potential Enhancements
- **LLM Costs**: We should mock or minimize real API calls for the MVP, or we could embed a small local model or placeholders that just produce random outcomes.
- **Performance**: Many agents running could hurt performance. For now, we can keep it at a small number (e.g., 5-10 bots).
- **Replay Value**: The emergent aspect might hook players if the interactions create surprising results. Otherwise, the game might feel repetitive. We’ll rely on the LLM’s unpredictability to keep it fresh.

---

## 2. Five Tickets to Implement “Swarm City”

Below are 5 separate tickets (each with a suggested branch name) that incrementally build the MVP.

### Ticket 1: Add a New Scene for Autonomous Agents

**Branch**: `feature/swarm-city-scene`

1. Create a new scene file `SwarmScene.ts` in `src/game/scenes/`.
2. Set up a small tile-based environment or just a solid color background.
3. Add placeholders for agent sprites.

**Acceptance Criteria**:
- A new scene named “SwarmScene” is created and added to the game config.
- The scene loads a simple background, sets up a camera, and displays placeholder sprites for agents.

### Ticket 2: Create Agent Logic and Basic Movement

**Branch**: `feature/agent-movement-logic`

1. Inside `SwarmScene`, define a small class, `SwarmAgent`, that holds position state (x, y) and a “think” method.
2. Make the “think” method pick a random direction or stand still.
3. Each frame, move the agent in the chosen direction.

**Acceptance Criteria**:
- Agents move around the scene randomly.
- Movement feels fluid, and doesn’t crash the game.

### Ticket 3: Add Items and Simple Pickup Logic

**Branch**: `feature/items-and-pickup`

1. Place items in random positions.
2. Give each agent the “pickup” action if it walks on an item tile.
3. On pickup, remove the item from the scene and store it in the agent’s inventory array.

**Acceptance Criteria**:
- Items appear in random spots.
- Agent collides with items and picks them up. 
- Item disappears from the scene.

### Ticket 4: Chat/Trade Interaction (Stubbed LLM Tools)

**Branch**: `feature/chat-trade-system`

1. Create a stub “Chat” method for the agent that just logs a message to the console or the UI (no real LLM calls yet).
2. Create a “Trade” method that, upon meeting another agent, tries to exchange items.
3. In code, just do a 50/50 chance that a trade goes through.

**Acceptance Criteria**:
- Agents occasionally meet and attempt to chat or trade.
- We see console logs for chat messages.
- Items can transfer from one agent’s inventory to another with some probability.

### Ticket 5: Integrate Scene into Main Menu & Update UI

**Branch**: `feature/integrate-swarm-and-ui`

1. Add a button on the `MainMenu.ts` to load the new “SwarmScene.”
2. Show a text overlay or debug UI in the `SwarmScene` with each agent’s inventory count (and chat logs if desired).
3. Tweak any leftover code for smooth transitions and a basic user experience.

**Acceptance Criteria**:
- A new “Play Swarm City” button in the main menu that starts `SwarmScene`.
- Visible overlay or debug text in `SwarmScene` with agent data.
- User can exit or reload scene without errors.

---

## 3. Terminal Commands & Git Diffs

Below are the commands and diffs for each ticket, in order. 

> **Tip**: For clarity, each ticket’s diffs are separate so you can apply them one by one. If you want to do them all at once, just combine them. 

### Overall Terminal Commands

```bash
# 1. Navigate into your cloned template directory
cd honeycomb

# 2. Checkout a new branch for each ticket and apply diffs
git checkout -b feature/swarm-city-scene
# (apply Ticket 1 diff)
git add .
git commit -m "Ticket 1: Add a new scene for autonomous agents"

# Then move to next ticket:
git checkout main
git checkout -b feature/agent-movement-logic
# (apply Ticket 2 diff)
git add .
git commit -m "Ticket 2: Create agent logic and movement"

# ... repeat for all tickets ...
```

---

### Ticket 1 Diff: Add a New Scene “SwarmScene”

**File:** `src/game/main.ts`  
**Purpose:** Insert “SwarmScene” into the scene list.

```diff
--- a/src/game/main.ts
+++ b/src/game/main.ts
@@ -1,10 +1,11 @@
 import { Boot } from './scenes/Boot';
 import { GameOver } from './scenes/GameOver';
 import { Game as MainGame } from './scenes/Game';
 import { MainMenu } from './scenes/MainMenu';
 import { AUTO, Game } from 'phaser';
 import { Preloader } from './scenes/Preloader';
+import { SwarmScene } from './scenes/SwarmScene';
 
 //  Find out more information about the Game Config at:
 //  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
 const config: Phaser.Types.Core.GameConfig = {
     type: AUTO,
     width: 1024,
@@ -15,6 +16,7 @@ const config: Phaser.Types.Core.GameConfig = {
         Preloader,
         MainMenu,
         MainGame,
+        SwarmScene,
         GameOver
     ]
 };
```

**File:** `src/game/scenes/SwarmScene.ts` (new):

```diff
--- /dev/null
+++ b/src/game/scenes/SwarmScene.ts
@@ -0,0 +1,40 @@
+import { Scene } from 'phaser';
+
+export class SwarmScene extends Scene {
+    constructor() {
+        super('SwarmScene');
+    }
+
+    preload() {
+        // Load any assets needed for the swarm environment
+        this.load.image('swarm-bg', 'assets/bg.png');
+        this.load.image('agent-placeholder', 'assets/star.png');
+    }
+
+    create() {
+        // A simple background
+        const bg = this.add.image(512, 384, 'swarm-bg');
+        bg.setAlpha(0.3);
+
+        // For now, just show a placeholder sprite to represent an agent
+        const agentSprite = this.add.sprite(512, 300, 'agent-placeholder');
+        agentSprite.setScale(1.5);
+
+        // We can add more logic soon
+        // ...
+    }
+
+    update(time: number, delta: number) {
+        // We'll add game logic in later tickets
+    }
+}
```

---

### Ticket 2 Diff: Create Agent Movement Logic

**File:** `src/game/scenes/SwarmScene.ts`

```diff
--- a/src/game/scenes/SwarmScene.ts
+++ b/src/game/scenes/SwarmScene.ts
@@ -1,6 +1,8 @@
 import { Scene } from 'phaser';

 export class SwarmScene extends Scene {
+    private agents: Phaser.GameObjects.Sprite[] = [];
+
     constructor() {
         super('SwarmScene');
     }
@@ -17,9 +19,31 @@ export class SwarmScene extends Scene {
         const bg = this.add.image(512, 384, 'swarm-bg');
         bg.setAlpha(0.3);

-        const agentSprite = this.add.sprite(512, 300, 'agent-placeholder');
-        agentSprite.setScale(1.5);
+        // Create a few agents
+        for (let i = 0; i < 5; i++) {
+            const x = Phaser.Math.Between(100, 900);
+            const y = Phaser.Math.Between(100, 600);
+            const spr = this.add.sprite(x, y, 'agent-placeholder');
+            spr.setScale(1.2);
+            this.agents.push(spr);
+        }
     }

     update(time: number, delta: number) {
-        // We'll add game logic in later tickets
+        // Simple random movement for each agent
+        this.agents.forEach((agent) => {
+            const moveX = Phaser.Math.Between(-1, 1);
+            const moveY = Phaser.Math.Between(-1, 1);
+            agent.x += moveX;
+            agent.y += moveY;
+        });
     }
 }
```

---

### Ticket 3 Diff: Add Items and Pickup Logic

**File:** `src/game/scenes/SwarmScene.ts`

```diff
--- a/src/game/scenes/SwarmScene.ts
+++ b/src/game/scenes/SwarmScene.ts
@@ -3,15 +3,22 @@ import { Scene } from 'phaser';

 export class SwarmScene extends Scene {
     private agents: Phaser.GameObjects.Sprite[] = [];
+    private items: Phaser.GameObjects.Sprite[] = [];

     constructor() {
         super('SwarmScene');
     }

     preload() {
         // Load any assets needed for the swarm environment
         this.load.image('swarm-bg', 'assets/bg.png');
         this.load.image('agent-placeholder', 'assets/star.png');
+        this.load.image('item', 'assets/logo.png'); // Using existing or new asset
     }

     create() {
@@ -24,9 +31,25 @@ export class SwarmScene extends Scene {
         for (let i = 0; i < 5; i++) {
             const x = Phaser.Math.Between(100, 900);
             const y = Phaser.Math.Between(100, 600);
+
             const spr = this.add.sprite(x, y, 'agent-placeholder');
             spr.setScale(1.2);
             this.agents.push(spr);
         }
+
+        // Create items
+        for (let i = 0; i < 5; i++) {
+            const x = Phaser.Math.Between(100, 900);
+            const y = Phaser.Math.Between(100, 600);
+            const item = this.add.sprite(x, y, 'item');
+            item.setScale(0.5);
+            this.items.push(item);
+        }
     }

     update(time: number, delta: number) {
         this.agents.forEach((agent) => {
             const moveX = Phaser.Math.Between(-1, 1);
             const moveY = Phaser.Math.Between(-1, 1);
@@ -39,4 +62,18 @@ export class SwarmScene extends Scene {
             agent.y += moveY;
         });

+        // Check collisions (very rough check)
+        this.agents.forEach((agent) => {
+            this.items.forEach((item, idx) => {
+                const dist = Phaser.Math.Distance.Between(
+                    agent.x, agent.y,
+                    item.x, item.y
+                );
+                // If close enough, pick up
+                if (dist < 20) {
+                    item.destroy();
+                    this.items.splice(idx, 1);
+                }
+            });
+        });
     }
 }
```

---

### Ticket 4 Diff: Chat/Trade Interaction (Stubbed Tools)

We’ll store “inventory” on each agent. We’ll add simple random “chats” in the console when two agents are near each other. 

**File:** `src/game/scenes/SwarmScene.ts`

```diff
--- a/src/game/scenes/SwarmScene.ts
+++ b/src/game/scenes/SwarmScene.ts
@@ -1,6 +1,20 @@
 import { Scene } from 'phaser';

+type AgentData = {
+  sprite: Phaser.GameObjects.Sprite,
+  inventory: number
+};
+
 export class SwarmScene extends Scene {
-    private agents: Phaser.GameObjects.Sprite[] = [];
+    private agents: AgentData[] = [];
     private items: Phaser.GameObjects.Sprite[] = [];

     constructor() {
         super('SwarmScene');
@@ -23,12 +37,18 @@ export class SwarmScene extends Scene {
         for (let i = 0; i < 5; i++) {
             const x = Phaser.Math.Between(100, 900);
             const y = Phaser.Math.Between(100, 600);
-            const spr = this.add.sprite(x, y, 'agent-placeholder');
-            spr.setScale(1.2);
-            this.agents.push(spr);
+            const sprite = this.add.sprite(x, y, 'agent-placeholder');
+            sprite.setScale(1.2);
+            this.agents.push({
+              sprite,
+              inventory: 0
+            });
         }

         // Create items
         ...
     }
@@ -40,26 +60,60 @@ export class SwarmScene extends Scene {
         this.agents.forEach((agent) => {
             const moveX = Phaser.Math.Between(-1, 1);
             const moveY = Phaser.Math.Between(-1, 1);
-            agent.x += moveX;
-            agent.y += moveY;
+            agent.sprite.x += moveX;
+            agent.sprite.y += moveY;
         });

         // Check collisions with items
         ...
+        
+        // Check agent-agent proximity for chat/trade
+        for (let i = 0; i < this.agents.length; i++) {
+            for (let j = i + 1; j < this.agents.length; j++) {
+                const a = this.agents[i];
+                const b = this.agents[j];
+                const dist = Phaser.Math.Distance.Between(
+                    a.sprite.x, a.sprite.y,
+                    b.sprite.x, b.sprite.y
+                );
+                if (dist < 30) {
+                    this.handleAgentEncounter(a, b);
+                }
+            }
+        }
     }

+    private handleAgentEncounter(a: AgentData, b: AgentData) {
+        // Chat
+        if (Phaser.Math.Between(0, 100) < 5) {
+            console.log(`Agent ${a.sprite.name} says: "Hello friend!"`);
+            console.log(`Agent ${b.sprite.name} replies: "Let's trade?"`);
+        }
+
+        // 50% chance to trade if both have some inventory
+        if (a.inventory > 0 && b.inventory > 0 && Phaser.Math.Between(0,1) === 1) {
+            a.inventory -= 1;
+            b.inventory += 1;
+            console.log(`Agents traded items!`);
+        }
+    }
+
     private checkItemPickup() {
         this.agents.forEach((agent) => {
             this.items.forEach((item, idx) => {
                 const dist = Phaser.Math.Distance.Between(
-                    agent.x, agent.y,
+                    agent.sprite.x, agent.sprite.y,
                     item.x, item.y
                 );
                 if (dist < 20) {
+                    agent.inventory += 1;
                     item.destroy();
                     this.items.splice(idx, 1);
                 }
             });
         });
     }
 }
```

---

### Ticket 5 Diff: Integrate Scene into Main Menu & Add UI

**File:** `src/game/scenes/MainMenu.ts`

```diff
--- a/src/game/scenes/MainMenu.ts
+++ b/src/game/scenes/MainMenu.ts
@@ -25,6 +25,14 @@ export class MainMenu extends Scene
     {
         this.logo = this.add.image(512, 300, 'logo').setDepth(100);

+        const swarmButton = this.add.text(512, 550, 'Play Swarm City', {
+            fontSize: '32px',
+            color: '#ffffff',
+        })
+        .setOrigin(0.5)
+        .setInteractive()
+        .on('pointerdown', () => {
+            this.scene.start('SwarmScene');
+        });
+
         this.title = this.add.text(512, 460, 'Main Menu', {
             fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
             stroke: '#000000', strokeThickness: 8,
```

**File:** `src/game/scenes/SwarmScene.ts`  
Add a bit of text in the corner to show agent data. (Below is a minimal snippet you can append in `create()` or `update()`.)

```diff
@@ -80,6 +80,7 @@ export class SwarmScene extends Scene {
     }
 
+    private debugText!: Phaser.GameObjects.Text;

     create() {
         ...
+        this.debugText = this.add.text(20, 20, 'Swarm Debug', { fontSize: '20px', color: '#ffffff' })
+            .setDepth(999);
     }

     update(time: number, delta: number) {
         ...
+        let debugStr = 'Agents:\n';
+        this.agents.forEach((a, idx) => {
+            debugStr += `Agent${idx} inv=${a.inventory}\n`;
+        });
+        this.debugText.setText(debugStr);
     }
```

---
