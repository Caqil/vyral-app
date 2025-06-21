<?php

namespace App\Services\Theme;

use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\File;

class ThemeService
{
    protected string $activeTheme = 'default';
    protected array $themes = [];

    public function __construct()
    {
        $this->loadAvailableThemes();
        $this->setActiveTheme(config('app.theme', 'default'));
    }

    public function setActiveTheme(string $theme): void
    {
        if ($this->themeExists($theme)) {
            $this->activeTheme = $theme;
            $this->registerThemeViews();
        }
    }

    public function getActiveTheme(): string
    {
        return $this->activeTheme;
    }

    public function getAvailableThemes(): array
    {
        return $this->themes;
    }

    protected function loadAvailableThemes(): void
    {
        $themesPath = resource_path('themes');

        if (File::exists($themesPath)) {
            $directories = File::directories($themesPath);

            foreach ($directories as $directory) {
                $themeName = basename($directory);
                $configPath = $directory . '/theme.json';

                if (File::exists($configPath)) {
                    $config = json_decode(File::get($configPath), true);
                    $this->themes[$themeName] = $config;
                } else {
                    $this->themes[$themeName] = [
                        'name' => ucfirst($themeName),
                        'version' => '1.0.0',
                        'description' => 'Default theme configuration'
                    ];
                }
            }
        }
    }

    protected function themeExists(string $theme): bool
    {
        return array_key_exists($theme, $this->themes);
    }

    protected function registerThemeViews(): void
    {
        $themePath = resource_path("themes/{$this->activeTheme}");

        if (File::exists($themePath)) {
            View::addNamespace('theme', $themePath);
        }
    }

    public function view(string $view, array $data = []): \Illuminate\View\View
    {
        // Try theme-specific view first, fall back to default views
        if (View::exists("theme::{$view}")) {
            return view("theme::{$view}", $data);
        }

        return view($view, $data);
    }
}