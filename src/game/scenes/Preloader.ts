import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        //  We loaded this image in our Boot Scene, so we can display it here
        this.add.image(512, 384, 'background');

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(512-230, 384, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.image('swarmBg2', 'swarm-bg-2.png');
        this.load.image('swarmBg', 'swarm-bg.png');

        // character assets
        this.load.image('player1', 'characters/player1.png');
        this.load.image('player2', 'characters/player2.png'); 
        this.load.image('player3', 'characters/player3.png');
        this.load.image('player4', 'characters/player4.png');
        this.load.image('player5', 'characters/player5.png');
        this.load.image('player6', 'characters/player6.png');
        this.load.image('player7', 'characters/player7.png');
        this.load.image('player8', 'characters/player8.png');
        this.load.image('player9', 'characters/player9.png');
        this.load.image('player10', 'characters/player10.png');
        this.load.image('player11', 'characters/player11.png');

        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');

        // Load audio tracks
        this.load.audio('track1', 'soundtrack/track1.mp3');
        this.load.audio('track2', 'soundtrack/track2.mp3');
        this.load.audio('track3', 'soundtrack/track3.mp3');
        this.load.audio('track4', 'soundtrack/track4.mp3');
        this.load.audio('track5', 'soundtrack/track5.mp3');
        // Add more tracks as needed
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('MainMenu');
    }
}
