module.exports = {
    apps: [{
        name: 'remote-printer',
        script: 'server.js',
        cwd: 'D:\\remoteprinter',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        // Windows specific settings
        interpreter: 'node',
        // Ensure proper output handling
        out_file: 'D:\\remoteprinter\\logs\\out.log',
        error_file: 'D:\\remoteprinter\\logs\\error.log',
        log_file: 'D:\\remoteprinter\\logs\\combined.log',
        time: true,
        // Merge logs
        merge_logs: true,
        // Kill timeout
        kill_timeout: 5000
    }]
};
