import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';

export class SwarmScene extends Scene
{
    swarmBg: GameObjects.Image;
    title: GameObjects.Text;
    private soundtracks: Phaser.Sound.BaseSound[] = [];
    private currentTrackIndex: number = 0;
    private player1: GameObjects.Image;
    private player2: GameObjects.Image;
    private player3: GameObjects.Image;
    private player4: GameObjects.Image;
    private player5: GameObjects.Image;
    private player6: GameObjects.Image;
    private player7: GameObjects.Image;
    private player8: GameObjects.Image;
    private player9: GameObjects.Image;
    private player10: GameObjects.Image;
    private player11: GameObjects.Image;
    constructor ()
    {
        super('SwarmScene');
    }

    create ()
    {
        this.swarmBg = this.add.image(512, 384, 'swarmBg');
        this.player1 = this.add.image(512, 384, 'player1');
        this.player2 = this.add.image(512, 384, 'player2');
        this.player3 = this.add.image(512, 384, 'player3');
        this.player4 = this.add.image(512, 384, 'player4');
        this.player5 = this.add.image(512, 384, 'player5');
        this.player6 = this.add.image(512, 384, 'player6');
        this.player7 = this.add.image(512, 384, 'player7');
        this.player8 = this.add.image(512, 384, 'player8');
        this.player9 = this.add.image(512, 384, 'player9');
        this.player10 = this.add.image(512, 384, 'player10');
        this.player11 = this.add.image(512, 384, 'player11');

        // this.logo = this.add.image(512, 300, 'logo').setDepth(100);

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
