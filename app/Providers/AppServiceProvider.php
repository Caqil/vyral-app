<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Services\Theme\ThemeService;
use Bjnstnkvc\ShadcnUi\ShadcnUiServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ThemeService::class);
    }

    public function boot(): void
    {
        // Register shadcn/ui components
        ShadcnUiServiceProvider::components();

        // Boot theme service
        app(ThemeService::class);
    }
}