import esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const commonOptions = {
    bundle: true,
    minify: !isWatch,
    sourcemap: isWatch,
    target: ['chrome100'],
    format: 'iife',
};

const buildOptions = [
    {
        ...commonOptions,
        entryPoints: ['src/background/index.ts'],
        outfile: 'dist/background.js',
    },
    {
        ...commonOptions,
        entryPoints: ['src/popup/index.ts'],
        outfile: 'dist/popup.js',
    },
];

async function build() {
    try {
        if (isWatch) {
            console.log('Watching for changes...');
            for (const options of buildOptions) {
                const ctx = await esbuild.context(options);
                await ctx.watch();
            }
        } else {
            for (const options of buildOptions) {
                await esbuild.build(options);
            }
            console.log('Build completed successfully!');
        }
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();