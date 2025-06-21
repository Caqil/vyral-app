<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\InstalledModule;
use App\Services\Module\ModuleInstaller;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;
use Nwidart\Modules\Facades\Module;
use Illuminate\Support\Facades\File;

class ModuleController extends Controller
{
    protected ModuleInstaller $installer;

    public function __construct(ModuleInstaller $installer)
    {
        $this->installer = $installer;
    }

    public function index(): View
    {
        $installedModules = InstalledModule::orderBy('name')->get();

        // Sync with Laravel Modules
        $this->syncModules();

        return view('admin::modules.index', compact('installedModules'));
    }

    public function create(): View
    {
        return view('admin::modules.create');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'module_file' => 'required|file|mimes:zip|max:51200', // 50MB
        ]);

        $result = $this->installer->installFromUpload($request->file('module_file'));

        if ($result['success']) {
            return redirect()->route('admin.modules.index')
                ->with('success', $result['message']);
        } else {
            return redirect()->back()
                ->with('error', $result['message'])
                ->withInput();
        }
    }

    public function show(InstalledModule $module): View
    {
        return view('admin::modules.show', compact('module'));
    }

    public function update(Request $request, InstalledModule $module): RedirectResponse
    {
        $action = $request->input('action');

        switch ($action) {
            case 'enable':
                $success = $this->installer->enableModule($module);
                $message = $success ? 'Module enabled successfully.' : 'Failed to enable module.';
                break;

            case 'disable':
                $success = $this->installer->disableModule($module);
                $message = $success ? 'Module disabled successfully.' : 'Failed to disable module.';
                break;

            default:
                return redirect()->back()->with('error', 'Invalid action.');
        }

        $type = $success ? 'success' : 'error';

        return redirect()->route('admin.modules.index')->with($type, $message);
    }

    public function destroy(InstalledModule $module): RedirectResponse
    {
        $success = $this->installer->uninstallModule($module);

        if ($success) {
            return redirect()->route('admin.modules.index')
                ->with('success', 'Module uninstalled successfully.');
        } else {
            return redirect()->route('admin.modules.index')
                ->with('error', 'Failed to uninstall module. Make sure it is disabled first.');
        }
    }

    protected function syncModules(): void
    {
        $laravelModules = Module::all();

        foreach ($laravelModules as $module) {
            // Get module.json data
            $moduleJson = $this->getModuleJsonData($module);

            InstalledModule::updateOrCreate(
                ['name' => $module->getName()],
                [
                    'alias' => $module->getLowerName(), // Use getLowerName() instead of getAlias()
                    'description' => $this->getModuleDescription($module, $moduleJson),
                    'version' => $moduleJson['version'] ?? '1.0.0',
                    'author' => $moduleJson['author'] ?? null,
                    'author_email' => $moduleJson['author_email'] ?? null,
                    'providers' => $moduleJson['providers'] ?? [],
                    'requirements' => $moduleJson['requirements'] ?? [],
                    'is_enabled' => $module->isEnabled(),
                    'is_core' => in_array($module->getName(), ['Admin', 'UserManagement', 'Frontend']),
                    'path' => $module->getPath(),
                    'installed_at' => now(),
                ]
            );
        }
    }

    /**
     * Get module.json data if it exists
     */
    protected function getModuleJsonData($module): array
    {
        $moduleJsonPath = $module->getPath() . '/module.json';

        if (File::exists($moduleJsonPath)) {
            $content = File::get($moduleJsonPath);
            return json_decode($content, true) ?: [];
        }

        return [];
    }

    /**
     * Get module description from various sources
     */
    protected function getModuleDescription($module, array $moduleJson): string
    {
        // Try to get description from module.json first
        if (!empty($moduleJson['description'])) {
            return $moduleJson['description'];
        }

        // Try to get from composer.json
        $composerJsonPath = $module->getPath() . '/composer.json';
        if (File::exists($composerJsonPath)) {
            $composerData = json_decode(File::get($composerJsonPath), true);
            if (!empty($composerData['description'])) {
                return $composerData['description'];
            }
        }

        // Default description
        return 'No description available';
    }
}