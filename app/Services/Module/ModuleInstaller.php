<?php
// app/Services/Module/ModuleInstaller.php

namespace App\Services\Module;

use App\Models\InstalledModule;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Artisan;
use ZipArchive;
use Exception;

class ModuleInstaller
{
    protected string $modulesPath;
    protected string $tempPath;

    public function __construct()
    {
        $this->modulesPath = base_path('Modules');
        $this->tempPath = storage_path('app/temp');
    }

    public function installFromUpload(UploadedFile $file): array
    {
        $this->ensureDirectories();

        try {
            // Validate file
            $this->validateFile($file);

            // Extract to temp directory
            $tempDir = $this->extractToTemp($file);

            // Validate module structure
            $moduleInfo = $this->validateModuleStructure($tempDir);

            // Check if module already exists
            $this->checkModuleExists($moduleInfo['name']);

            // Install module
            $installedPath = $this->installModule($tempDir, $moduleInfo);

            // Register in database
            $installedModule = $this->registerModule($moduleInfo, $installedPath);

            // Cleanup temp files
            $this->cleanup($tempDir);

            return [
                'success' => true,
                'message' => "Module '{$moduleInfo['name']}' installed successfully.",
                'module' => $installedModule
            ];

        } catch (Exception $e) {
            // Cleanup on error
            if (isset($tempDir)) {
                $this->cleanup($tempDir);
            }

            return [
                'success' => false,
                'message' => $e->getMessage(),
                'module' => null
            ];
        }
    }

    protected function validateFile(UploadedFile $file): void
    {
        if ($file->getClientOriginalExtension() !== 'zip') {
            throw new Exception('Only ZIP files are allowed.');
        }

        if ($file->getSize() > 50 * 1024 * 1024) { // 50MB limit
            throw new Exception('File size exceeds 50MB limit.');
        }
    }

    protected function extractToTemp(UploadedFile $file): string
    {
        $tempDir = $this->tempPath . '/' . uniqid('module_');
        File::makeDirectory($tempDir, 0755, true);

        $zip = new ZipArchive();
        $result = $zip->open($file->getPathname());

        if ($result !== TRUE) {
            throw new Exception('Failed to open ZIP file.');
        }

        $zip->extractTo($tempDir);
        $zip->close();

        return $tempDir;
    }

    protected function validateModuleStructure(string $tempDir): array
    {
        // Look for module.json in root or subdirectory
        $moduleJsonPath = null;
        $moduleRoot = null;

        if (File::exists($tempDir . '/module.json')) {
            $moduleJsonPath = $tempDir . '/module.json';
            $moduleRoot = $tempDir;
        } else {
            // Check subdirectories
            $directories = File::directories($tempDir);
            foreach ($directories as $dir) {
                if (File::exists($dir . '/module.json')) {
                    $moduleJsonPath = $dir . '/module.json';
                    $moduleRoot = $dir;
                    break;
                }
            }
        }

        if (!$moduleJsonPath) {
            throw new Exception('Invalid module structure: module.json not found.');
        }

        $moduleInfo = json_decode(File::get($moduleJsonPath), true);

        if (!$moduleInfo) {
            throw new Exception('Invalid module.json format.');
        }

        // Validate required fields
        $required = ['name', 'alias', 'description'];
        foreach ($required as $field) {
            if (!isset($moduleInfo[$field]) || empty($moduleInfo[$field])) {
                throw new Exception("Missing required field: {$field}");
            }
        }

        // Validate module structure
        $requiredDirs = ['app/Http/Controllers', 'resources/views'];
        foreach ($requiredDirs as $dir) {
            if (!File::exists($moduleRoot . '/' . $dir)) {
                throw new Exception("Missing required directory: {$dir}");
            }
        }

        $moduleInfo['root_path'] = $moduleRoot;
        return $moduleInfo;
    }

    protected function checkModuleExists(string $moduleName): void
    {
        if (InstalledModule::where('name', $moduleName)->exists()) {
            throw new Exception("Module '{$moduleName}' is already installed.");
        }

        if (File::exists($this->modulesPath . '/' . $moduleName)) {
            throw new Exception("Module directory '{$moduleName}' already exists.");
        }
    }

    protected function installModule(string $tempDir, array $moduleInfo): string
    {
        $targetPath = $this->modulesPath . '/' . $moduleInfo['name'];

        File::copyDirectory($moduleInfo['root_path'], $targetPath);

        return $targetPath;
    }

    protected function registerModule(array $moduleInfo, string $installedPath): InstalledModule
    {
        return InstalledModule::create([
            'name' => $moduleInfo['name'],
            'alias' => $moduleInfo['alias'],
            'description' => $moduleInfo['description'],
            'version' => $moduleInfo['version'] ?? '1.0.0',
            'author' => $moduleInfo['author'] ?? null,
            'author_email' => $moduleInfo['author_email'] ?? null,
            'providers' => $moduleInfo['providers'] ?? [],
            'requirements' => $moduleInfo['requirements'] ?? [],
            'is_enabled' => false,
            'is_core' => false,
            'path' => $installedPath,
            'namespace' => 'Modules',
            'installed_at' => now(),
        ]);
    }

    protected function cleanup(string $tempDir): void
    {
        if (File::exists($tempDir)) {
            File::deleteDirectory($tempDir);
        }
    }

    protected function ensureDirectories(): void
    {
        if (!File::exists($this->modulesPath)) {
            File::makeDirectory($this->modulesPath, 0755, true);
        }

        if (!File::exists($this->tempPath)) {
            File::makeDirectory($this->tempPath, 0755, true);
        }
    }

    public function enableModule(InstalledModule $module): bool
    {
        try {
            // Enable using Laravel Modules
            Artisan::call('module:enable', ['module' => $module->name]);

            $module->update(['is_enabled' => true]);

            return true;
        } catch (Exception $e) {
            return false;
        }
    }

    public function disableModule(InstalledModule $module): bool
    {
        try {
            if (!$module->canBeDisabled()) {
                throw new Exception('Core modules cannot be disabled.');
            }

            // Disable using Laravel Modules
            Artisan::call('module:disable', ['module' => $module->name]);

            $module->update(['is_enabled' => false]);

            return true;
        } catch (Exception $e) {
            return false;
        }
    }

    public function uninstallModule(InstalledModule $module): bool
    {
        try {
            if (!$module->canBeDeleted()) {
                throw new Exception('Module must be disabled before uninstalling.');
            }

            // Remove module directory
            if (File::exists($module->path)) {
                File::deleteDirectory($module->path);
            }

            // Remove from database
            $module->delete();

            return true;
        } catch (Exception $e) {
            return false;
        }
    }
}