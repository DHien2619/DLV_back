// Standalone test: run pipeline on an audio file, print result JSON.
// Usage: node agent/test-pipeline.js [path-to-audio.mp3]

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { analyzeCall } = require('./pipeline');

(async () => {
    const filePath = process.argv[2] || path.resolve(__dirname, '../../frontend/dummy.mp3');
    if (!fs.existsSync(filePath)) {
        console.error(`Audio file not found: ${filePath}`);
        process.exit(1);
    }
    console.log(`Analyzing: ${filePath}`);
    console.log(`Size: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`);
    console.log('---');

    const t0 = Date.now();
    try {
        const result = await analyzeCall(filePath, {
            mimeType: 'audio/mpeg',
            metadata: { source: 'test-script' },
            onProgress: (step, status) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${step}: ${status}`)
        });

        console.log('\n=== RESULT ===');
        console.log('Analysis version:', result.analysis_version);
        console.log('Processing ms:', result.processing_ms);
        console.log('Segments:', result.diarized?.segments?.length);

        if (result.quality && !result.quality.error) {
            console.log('\n--- QUALITY ---');
            console.log('Total score:', result.quality.total_score, '/ 100');
            console.log('Grade:', result.quality.overall_grade);
            console.log('Strengths:', result.quality.top_strengths);
            console.log('Improvements:', result.quality.top_improvements);
        } else if (result.quality?.error) {
            console.log('Quality FAILED:', result.quality.error);
        }

        if (result.opportunity && !result.opportunity.error) {
            console.log('\n--- OPPORTUNITY ---');
            console.log('Score:', result.opportunity.score, 'Stage:', result.opportunity.stage);
            console.log('Next action:', result.opportunity.next_best_action);
            console.log('Buying signals:', result.opportunity.buying_signals?.length);
            console.log('Objections:', result.opportunity.objections?.length);
        }

        if (result.compliance && !result.compliance.error) {
            console.log('\n--- COMPLIANCE ---');
            console.log('Status:', result.compliance.overall_status);
            console.log('Events:', result.compliance.events?.length);
        }

        if (result.structure && !result.structure.error) {
            console.log('\n--- STRUCTURE ---');
            console.log('Summary:', result.structure.summary_short);
            console.log('Phases:', result.structure.phases?.map(p => p.phase).join(' → '));
            console.log('Moments:', result.structure.moments?.length);
            console.log('Talk ratio:', result.structure.talk_ratio);
        }

        const outFile = path.resolve(__dirname, '../last-analysis.json');
        fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
        console.log(`\nFull result saved to: ${outFile}`);
        console.log(`Total wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err) {
        console.error('FATAL:', err);
        process.exit(2);
    }
})();
