import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';

type AgentData = {
    sprite: GameObjects.Sprite;
    items: number;
    name: string;
    health: number;
    speed: number;
}

export class SwarmScene extends Scene
{
    private swarmBg: GameObjects.Image;
    private title: GameObjects.Text;
    private soundtracks: Phaser.Sound.BaseSound[] = [];
    private currentTrackIndex: number = 0;
    private agents: AgentData[] = [];
    private items: GameObjects.Sprite[] = [];
    private selectedAgentId: number | null = null;
    private muteButton: GameObjects.Text;
    private isMuted: boolean = false;

    constructor ()
    {
        super('SwarmScene');
    }

    create ()
    {
        this.swarmBg = this.add.image(512, 384, 'swarmBg');
        this.swarmBg.setAlpha(0.3);

        // Add mute button
        this.muteButton = this.add.text(980, 20, '🔊', {
            fontSize: '32px'
        }).setInteractive();

        this.muteButton.on('pointerdown', () => {
            this.isMuted = !this.isMuted;
            this.sound.mute = this.isMuted;
            this.muteButton.setText(this.isMuted ? '🔇' : '🔊');
        });

        // Create swarm agents
        for (let i = 0; i < 3; i++) {
            const x = Phaser.Math.Between(100, 900);
            const y = Phaser.Math.Between(100, 600);
            const sprite = this.add.sprite(x, y, `player${i+1}`);
            sprite.setScale(1.2);
            sprite.setInteractive({ draggable: true });
            
            // Add drag handlers
            sprite.on('dragstart', () => {
                sprite.setTint(0x00ff00);
            });
            
            sprite.on('drag', (pointer: Phaser.Input.Pointer) => {
                sprite.x = pointer.x;
                sprite.y = pointer.y;
            });
            
            sprite.on('dragend', () => {
                sprite.clearTint();
            });
            
            const agent: AgentData = {
                sprite,
                items: 0,
                name: `Agent ${i+1}`,
                health: Phaser.Math.Between(70, 100),
                speed: Phaser.Math.Between(5, 10)
            };
            
            // Add click handler
            sprite.on('pointerdown', () => {
                this.selectedAgentId = i;
                const { name, health, speed } = agent;
                EventBus.emit('agent-selected', { name, health, speed });
            });
            
            this.agents.push(agent);
        }

        // Create items
        for (let i = 0; i < 3; i++) {
            const x = Phaser.Math.Between(100, 900);
            const y = Phaser.Math.Between(100, 600);
            const item = this.add.sprite(x, y, `item${i+1}`);
            item.setScale(0.5);
            this.items.push(item);
        }

        this.title = this.add.text(512, 460, 'Swarm Scene', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        // Load and play soundtracks
        const tracks = [
            'track1',
            'track2',
            'track3', 
            'track4',
            'track5'
        ];

        tracks.forEach(key => {
            const track = this.sound.add(key, {
                loop: false,
                volume: 1
            });
            track.on('complete', () => {
                console.log(`Track ${key} completed`);
                this.playNextTrack();
            });
            track.on('loaderror', () => console.error(`Error loading track ${key}`));
            this.soundtracks.push(track);
        });

        // Start with first track
        this.currentTrackIndex = -1; // Reset to -1 so first track will be 0
        this.playNextTrack();

        EventBus.emit('current-scene-ready', this);
    }
    
    update(time: number, delta: number) {
        // Modify the movement code to only move agents that aren't being dragged
        this.agents.forEach((agent) => {
            if (!agent.sprite.input?.dragState) { // Only move if not being dragged
                const moveX = Phaser.Math.Between(-1, 1);
                const moveY = Phaser.Math.Between(-1, 1); 
                agent.sprite.x += moveX;
                agent.sprite.y += moveY;
            }
        });

        // Check collisions with items
        this.agents.forEach((agent) => {
            this.items.forEach((item, idx) => {
                const dist = Phaser.Math.Distance.Between(
                    agent.sprite.x, agent.sprite.y,
                    item.x, item.y
                );
                // If close enough, pick up
                if (dist < 20) {
                    agent.items += 1;
                    item.destroy();
                    this.items.splice(idx, 1);
                }
            });
        });

        // Check agent-agent proximity for chat/trade
        for (let i = 0; i < this.agents.length; i++) {
            for (let j = i + 1; j < this.agents.length; j++) {
                const a = this.agents[i];
                const b = this.agents[j];
                const dist = Phaser.Math.Distance.Between(
                    a.sprite.x, a.sprite.y,
                    b.sprite.x, b.sprite.y
                );
                if (dist < 30) {
                    this.handleAgentEncounter(a, b);
                }
            }
        }
    }

    private handleAgentEncounter(a: AgentData, b: AgentData) {
        // Chat
        if (Phaser.Math.Between(0, 100) < 5) {
            console.log(`${a.name} says: "Hello friend!"`);
            console.log(`${b.name} replies: "Let's trade?"`);
        }

        // 50% chance to trade if both have items
        if (a.items > 0 && b.items > 0 && Phaser.Math.Between(0,1) === 1) {
            a.items -= 1;
            b.items += 1;
            console.log(`${a.name} traded with ${b.name}!`);
        }
    }

    changeScene ()
    {
        this.scene.start('MainMenu');
    }

    private playNextTrack() {
        // Stop current track if playing
        if (this.soundtracks[this.currentTrackIndex]?.isPlaying) {
            this.soundtracks[this.currentTrackIndex].stop();
        }

        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.soundtracks.length;
        console.log(`Playing track ${this.currentTrackIndex + 1}`);
        
        try {
            this.soundtracks[this.currentTrackIndex].play();
        } catch (error) {
            console.error('Error playing track:', error);
        }
    }
}
