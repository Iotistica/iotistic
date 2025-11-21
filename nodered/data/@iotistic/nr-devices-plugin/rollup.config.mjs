import postcss from 'rollup-plugin-postcss'
import terser from '@rollup/plugin-terser'
import cssnano from 'cssnano'
import copy from 'rollup-plugin-copy'
import fg from 'fast-glob'
import html from 'rollup-plugin-html' // Import the HTML plugin

export default {
    external: ['jquery', 'node-red'],
    input: 'src/ui/index.js',
    plugins: [
        {
            name: 'watch-external',
            async buildStart () {
                const files = await fg('src/**/*')
                for (const file of files) {
                    this.addWatchFile(file)
                }
            }
        },
        postcss({
            plugins: [
                cssnano()
            ]
        }),
        html({
            include: '**/*.html' // Process all .html files
        }),
        {
            name: 'wrap-output',
            generateBundle: (options, bundle, isWrite) => {
                if (bundle['plugin.html']) {
                    bundle['plugin.html'].code = `<script type="text/javascript">${bundle['plugin.html'].code}</script>`
                }
            }
        },
        copy({
            targets: [
                { src: 'src/plugin.js', dest: 'dist/' },
                { src: 'src/lib', dest: 'dist/' }
            ]
        })
    ],
    output: [{
        file: 'dist/plugin.html',
        format: 'iife',
        globals: {
            jquery: '$',
            'node-red': 'RED'
        },
        plugins: [
            terser()
        ]
    }]
}
