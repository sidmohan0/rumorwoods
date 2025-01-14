import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';

export class SwarmScene extends Scene
{
    private swarmBg: GameObjects.Image;
    private title: GameObjects.Text;
    private soundtracks: Phaser.Sound.BaseSound[] = [];
    private currentTrackIndex: number = 0;
    private agents: GameObjects.Sprite[] = [];
    private items: GameObjects.Sprite[] = [];
    private agentInfo: { [key: number]: {name: string, health: number, speed: number} } = {};
    private selectedAgentId: number | null = null;

    constructor ()
    {
        super('SwarmScene');
    }

    create ()
    {
        this.swarmBg = this.add.image(512, 384, 'swarmBg');
        this.swarmBg.setAlpha(0.3);

        // Create swarm agents
        for (let i = 0; i < 3; i++) {
            const x = Phaser.Math.Between(100, 900);
            const y = Phaser.Math.Between(100, 600);
            const agent = this.add.sprite(x, y, `player${i+1}`);
            agent.setScale(1.2);
            agent.setInteractive();
            
            // Store agent info
            this.agentInfo[i] = {
                name: `Agent ${i+1}`,
                health: Phaser.Math.Between(70, 100),
                speed: Phaser.Math.Between(5, 10)
            };
            
            // Add click handler
            agent.on('pointerdown', () => {
                this.selectedAgentId = i;
                EventBus.emit('agent-selected', this.agentInfo[i]);
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
        // Random movement for each agent
        this.agents.forEach((agent) => {
            const moveX = Phaser.Math.Between(-1, 1);
            const moveY = Phaser.Math.Between(-1, 1); 
            agent.x += moveX;
            agent.y += moveY;
        });

        // Check collisions with items
        this.agents.forEach((agent) => {
            this.items.forEach((item, idx) => {
                const dist = Phaser.Math.Distance.Between(
                    agent.x, agent.y,
                    item.x, item.y
                );
                // If close enough, pick up
                if (dist < 20) {
                    item.destroy();
                    this.items.splice(idx, 1);
                }
            });
        });
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
