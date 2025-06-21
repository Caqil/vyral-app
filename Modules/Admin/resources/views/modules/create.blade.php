@extends('admin::layouts.app')

@section('title', 'Upload Module')
@section('page-title', 'Upload New Module')
@section('page-description', 'Install a new module by uploading a ZIP file')

@section('content')
    <div class="max-w-2xl mx-auto">
        <div class="bg-card border border-border rounded-lg p-6">
            <form method="POST" action="{{ route('admin.modules.store') }}" enctype="multipart/form-data"
                x-data="{ dragOver: false }" class="space-y-6">
                @csrf

                <!-- File Upload Area -->
                <div class="space-y-2">
                    <label class="block text-sm font-medium text-card-foreground">
                        Module ZIP File
                    </label>

                    <div class="relative"
                        @drop.prevent="dragOver = false; $refs.fileInput.files = $event.dataTransfer.files"
                        @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false"
                        :class="{ 'border-primary bg-primary/5': dragOver }">

                        <input type="file" name="module_file" accept=".zip" required x-ref="fileInput"
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" @change="dragOver = false">

                        <div
                            class="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
                            <svg class="w-12 h-12 text-muted-foreground mx-auto mb-4" fill="none" stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12">
                                </path>
                            </svg>
                            <p class="text-sm font-medium text-card-foreground mb-2">
                                Drop your ZIP file here, or click to browse
                            </p>
                            <p class="text-xs text-muted-foreground">
                                Maximum file size: 50MB
                            </p>
                        </div>
                    </div>

                    @error('module_file')
                        <p class="text-sm text-destructive">{{ $message }}</p>
                    @enderror
                </div>

                <!-- Module Requirements -->
                <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Module Requirements</h4>
                    <ul class="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                        <li>• Must be a valid ZIP file</li>
                        <li>• Must contain a module.json file in the root</li>
                        <li>• Required directories: app/Http/Controllers, resources/views</li>
                        <li>• Module name must be unique</li>
                    </ul>
                </div>

                <!-- Example module.json -->
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h4 class="text-sm font-medium text-card-foreground mb-2">Example module.json</h4>
                    <pre class="text-xs text-muted-foreground overflow-x-auto"><code>{
      "name": "BlogModule",
      "alias": "blog",
      "description": "A simple blog module",
      "version": "1.0.0",
      "author": "Your Name",
      "author_email": "your.email@example.com",
      "providers": [
        "Modules\\BlogModule\\Providers\\BlogModuleServiceProvider"
      ]
    }</code></pre>
                </div>

                <!-- Actions -->
                <div class="flex items-center justify-between pt-6 border-t border-border">
                    <a href="{{ route('admin.modules.index') }}" class="btn-ghost">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                        </svg>
                        Back to Modules
                    </a>

                    <button type="submit" class="btn-default">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12">
                            </path>
                        </svg>
                        Upload Module
                    </button>
                </div>
            </form>
        </div>
    </div>

    @push('scripts')
        <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    @endpush
@endsection