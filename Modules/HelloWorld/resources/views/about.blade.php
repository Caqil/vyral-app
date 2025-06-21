@extends('helloworld::layouts.master')

@section('title', 'About HelloWorld Module')

@section('content')
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">About {{ $moduleInfo['name'] }} Module</h1>
            <p class="text-lg text-gray-600 dark:text-gray-300">{{ $moduleInfo['description'] }}</p>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 mb-8">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-6">Module Information</h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Module Name</dt>
                    <dd class="text-lg text-gray-900 dark:text-white">{{ $moduleInfo['name'] }}</dd>
                </div>

                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Version</dt>
                    <dd class="text-lg text-gray-900 dark:text-white">{{ $moduleInfo['version'] }}</dd>
                </div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-6">Features</h2>

            <ul class="space-y-3">
                @foreach($moduleInfo['features'] as $feature)
                    <li class="flex items-center">
                        <div class="w-5 h-5 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mr-3">
                            <svg class="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <span class="text-gray-700 dark:text-gray-300">{{ $feature }}</span>
                    </li>
                @endforeach
            </ul>
        </div>
    </div>
@endsection