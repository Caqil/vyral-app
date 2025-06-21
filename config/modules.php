<?php

use Nwidart\Modules\Activators\FileActivator;

return [
    /*
    |--------------------------------------------------------------------------
    | Module Namespace
    |--------------------------------------------------------------------------
    */
    'namespace' => 'Modules',

    /*
    |--------------------------------------------------------------------------
    | Module Stubs
    |--------------------------------------------------------------------------
    */
    'stubs' => [
        'enabled' => false,
        'path' => base_path('vendor/nwidart/laravel-modules/src/Commands/stubs'),
        'files' => [
            'routes/web' => 'routes/web.php',
            'routes/api' => 'routes/api.php',
            'views/index' => 'resources/views/index.blade.php',
            'views/master' => 'resources/views/layouts/master.blade.php',
            'scaffold/config' => 'config/config.php',
            'composer' => 'composer.json',
            'assets/js/app' => 'resources/assets/js/app.js',
            'assets/sass/app' => 'resources/assets/sass/app.scss',
            'vite' => 'vite.config.js',
            'package' => 'package.json',
        ],
        'replacements' => [
            'routes/web' => ['LOWER_NAME', 'STUDLY_NAME', 'MODULE_NAMESPACE', 'CONTROLLER_NAMESPACE'],
            'routes/api' => ['LOWER_NAME', 'STUDLY_NAME', 'MODULE_NAMESPACE', 'STUDLY_NAME', 'CONTROLLER_NAMESPACE'],
            'vite' => ['LOWER_NAME'],
            'json' => ['LOWER_NAME', 'STUDLY_NAME', 'MODULE_NAMESPACE', 'PROVIDER_NAMESPACE'],
            'views/index' => ['LOWER_NAME'],
            'views/master' => ['LOWER_NAME', 'STUDLY_NAME'],
            'scaffold/config' => ['STUDLY_NAME'],
            'composer' => [
                'LOWER_NAME',
                'STUDLY_NAME',
                'VENDOR',
                'AUTHOR_NAME',
                'AUTHOR_EMAIL',
                'MODULE_NAMESPACE',
                'PROVIDER_NAMESPACE',
            ],
        ],
        'gitkeep' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Package commands
    |--------------------------------------------------------------------------
    */
    'commands' => \Nwidart\Modules\Providers\ConsoleServiceProvider::defaultCommands()
        ->merge([
            // Custom commands can be added here
        ])->toArray(),

    /*
    |--------------------------------------------------------------------------
    | Scan Path
    |--------------------------------------------------------------------------
    */
    'scan' => [
        'enabled' => false,
        'paths' => [
            base_path('vendor/*/*'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Composer File Template
    |--------------------------------------------------------------------------
    */
    'composer' => [
        'vendor' => 'nwidart',
        'author' => [
            'name' => 'Nicolas Widart',
            'email' => 'n.widart@gmail.com',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Choose what laravel-modules will register as custom namespaces.
    |--------------------------------------------------------------------------
    */
    'register' => [
        'translations' => true,
        'files' => 'register',
    ],

    /*
    |--------------------------------------------------------------------------
    | Activators
    |--------------------------------------------------------------------------
    */
    'activators' => [
        'file' => [
            'class' => FileActivator::class,
            'statuses-file' => base_path('modules_statuses.json'),
        ],
    ],

    'activator' => 'file',

    /*
    |--------------------------------------------------------------------------
    | Paths
    |--------------------------------------------------------------------------
    */
    'paths' => [
        'modules' => base_path('Modules'),
        'assets' => public_path('modules'),
        'migration' => base_path('database/migrations'),

        // THIS IS THE MISSING CONFIGURATION
        'app_folder' => 'app/',

        'generator' => [
            // App
            'channels' => ['path' => 'app/Broadcasting', 'generate' => false],
            'command' => ['path' => 'app/Console', 'generate' => false],
            'emails' => ['path' => 'app/Emails', 'generate' => false],
            'event' => ['path' => 'app/Events', 'generate' => false],
            'jobs' => ['path' => 'app/Jobs', 'generate' => false],
            'listener' => ['path' => 'app/Listeners', 'generate' => false],
            'model' => ['path' => 'app/Models', 'generate' => false],
            'notifications' => ['path' => 'app/Notifications', 'generate' => false],
            'observer' => ['path' => 'app/Observers', 'generate' => false],
            'policies' => ['path' => 'app/Policies', 'generate' => false],
            'provider' => ['path' => 'app/Providers', 'generate' => true],
            'repository' => ['path' => 'app/Repositories', 'generate' => false],
            'resource' => ['path' => 'app/Transformers', 'generate' => false],
            'rules' => ['path' => 'app/Rules', 'generate' => false],
            'component-class' => ['path' => 'app/View/Components', 'generate' => false],

            // App/Http
            'controller' => ['path' => 'app/Http/Controllers', 'generate' => true],
            'filter' => ['path' => 'app/Http/Middleware', 'generate' => false],
            'request' => ['path' => 'app/Http/Requests', 'generate' => false],
            'resource' => ['path' => 'app/Http/Resources', 'generate' => false],

            // Config
            'config' => ['path' => 'config', 'generate' => true],

            // Database
            'migration' => ['path' => 'database/migrations', 'generate' => true],
            'seeder' => ['path' => 'database/seeders', 'generate' => true],
            'factory' => ['path' => 'database/factories', 'generate' => true],

            // Resources
            'lang' => ['path' => 'resources/lang', 'generate' => false],
            'views' => ['path' => 'resources/views', 'generate' => true],
            'component-view' => ['path' => 'resources/views/components', 'generate' => false],

            // Routes
            'routes' => ['path' => 'routes', 'generate' => true],

            // Tests
            'test' => ['path' => 'tests/Unit', 'generate' => false],
            'test-feature' => ['path' => 'tests/Feature', 'generate' => false],
        ],
    ],
];