<?php

namespace Modules\HelloWorld\app\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

class HelloWorldController extends Controller
{
    /**
     * Display the hello world page
     */
    public function index(): View
    {
        $data = [
            'title' => 'Hello World Module',
            'message' => 'Welcome to the Hello World module!',
            'current_time' => now()->format('Y-m-d H:i:s'),
            'random_fact' => $this->getRandomFact(),
        ];

        return view('helloworld::index', $data);
    }

    /**
     * Display module information
     */
    public function about(): View
    {
        $moduleInfo = [
            'name' => 'HelloWorld',
            'version' => '1.0.0',
            'description' => 'A simple test module',
            'features' => [
                'Simple greeting page',
                'Module information display',
                'Random facts generator',
                'Beautiful UI with Tailwind CSS'
            ]
        ];

        return view('helloworld::about', compact('moduleInfo'));
    }

    /**
     * Get a random programming fact
     */
    private function getRandomFact(): string
    {
        $facts = [
            "The first computer bug was an actual bug - a moth found stuck in a relay in 1947.",
            "The term 'debugging' was coined by Admiral Grace Hopper.",
            "JavaScript was created in just 10 days by Brendan Eich in 1995.",
            "The first computer programmer was Ada Lovelace in 1843.",
            "Linux kernel has over 28 million lines of code.",
            "Google processes over 8.5 billion searches per day.",
            "The first domain name ever registered was symbolics.com in 1985.",
            "Python was named after Monty Python's Flying Circus.",
        ];

        return $facts[array_rand($facts)];
    }
}