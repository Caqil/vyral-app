<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'HelloWorld Module') - {{ config('app.name', 'Laravel') }}</title>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body class="font-sans antialiased bg-gray-50 dark:bg-gray-900">
    <div class="min-h-screen">
        <!-- Navigation -->
        <nav class="bg-white dark:bg-gray-800 shadow">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between h-16">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 flex items-center">
                            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                                <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">HelloWorld Module</h1>
                        </div>

                        <div class="hidden md:ml-8 md:flex md:space-x-8">
                            <a href="{{ route('hello.index') }}"
                                class="text-gray-900 dark:text-white hover:text-blue-600 px-3 py-2 text-sm font-medium {{ request()->routeIs('hello.index') ? 'text-blue-600' : '' }}">
                                Home
                            </a>
                            <a href="{{ route('hello.about') }}"
                                class="text-gray-500 dark:text-gray-300 hover:text-blue-600 px-3 py-2 text-sm font-medium {{ request()->routeIs('hello.about') ? 'text-blue-600' : '' }}">
                                About
                            </a>
                        </div>
                    </div>

                    <div class="flex items-center">
                        @auth
                            <a href="{{ route('dashboard') }}"
                                class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100">
                                Back to Dashboard
                            </a>
                        @else
                            <a href="{{ route('login') }}"
                                class="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100">
                                Login
                            </a>
                        @endauth
                    </div>
                </div>
            </div>
        </nav>

        <!-- Page Content -->
        <main class="py-12">
            @yield('content')
        </main>

        <!-- Footer -->
        <footer class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <div class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                <p class="text-center text-sm text-gray-500 dark:text-gray-400">
                    HelloWorld Module v1.0.0 - Created for testing modular architecture
                </p>
            </div>
        </footer>
    </div>
</body>

</html>