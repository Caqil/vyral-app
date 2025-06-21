@extends('admin::layouts.app')

@section('title', 'File Manager')
@section('page-title', 'File Manager')
@section('page-description', 'Browse and manage application files')

@section('content')
    <div class="space-y-6">

        <!-- File Manager Toolbar -->
        <div class="card">
            <div class="card-body">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <!-- Path Breadcrumb -->
                        <nav class="text-sm">
                            <ol class="flex items-center space-x-2">
                                <li><a href="#" class="text-primary hover:underline">root</a></li>
                                <li><span class="text-muted-foreground">/</span></li>
                                <li><a href="#" class="text-primary hover:underline">storage</a></li>
                                <li><span class="text-muted-foreground">/</span></li>
                                <li class="text-muted-foreground">uploads</li>
                            </ol>
                        </nav>
                    </div>

                    <div class="flex items-center space-x-2">
                        <button class="btn-outline btn-sm">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4">
                                </path>
                            </svg>
                            New Folder
                        </button>
                        <button class="btn-primary btn-sm">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12">
                                </path>
                            </svg>
                            Upload
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- File Grid -->
        <div class="card">
            <div class="card-body">
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">

                    <!-- Folder Item -->
                    <div class="p-3 border border-border rounded hover:bg-accent cursor-pointer">
                        <div class="text-center">
                            <svg class="w-12 h-12 mx-auto text-blue-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <p class="text-sm font-medium truncate">Documents</p>
                            <p class="text-xs text-muted-foreground">24 items</p>
                        </div>
                    </div>

                    <!-- Image File -->
                    <div class="p-3 border border-border rounded hover:bg-accent cursor-pointer">
                        <div class="text-center">
                            <svg class="w-12 h-12 mx-auto text-green-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p class="text-sm font-medium truncate">logo.png</p>
                            <p class="text-xs text-muted-foreground">2.3 MB</p>
                        </div>
                    </div>

                    <!-- PDF File -->
                    <div class="p-3 border border-border rounded hover:bg-accent cursor-pointer">
                        <div class="text-center">
                            <svg class="w-12 h-12 mx-auto text-red-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p class="text-sm font-medium truncate">report.pdf</p>
                            <p class="text-xs text-muted-foreground">5.7 MB</p>
                        </div>
                    </div>

                    <!-- Text File -->
                    <div class="p-3 border border-border rounded hover:bg-accent cursor-pointer">
                        <div class="text-center">
                            <svg class="w-12 h-12 mx-auto text-gray-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p class="text-sm font-medium truncate">readme.txt</p>
                            <p class="text-xs text-muted-foreground">1.2 KB</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <!-- File Details Panel -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2">
                <!-- File preview would go here -->
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="text-lg font-semibold">Storage Info</h3>
                </div>
                <div class="card-body space-y-4">
                    <div>
                        <div class="flex justify-between text-sm mb-1">
                            <span>Used</span>
                            <span>2.3 GB / 10 GB</span>
                        </div>
                        <div class="w-full bg-muted rounded-full h-2">
                            <div class="bg-primary h-2 rounded-full" style="width: 23%"></div>
                        </div>
                    </div>

                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span>Images</span>
                            <span>850 MB</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Documents</span>
                            <span>1.2 GB</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Other</span>
                            <span>250 MB</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection