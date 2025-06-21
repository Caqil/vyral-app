<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\View\View;
use Carbon\Carbon;

class AnalyticsController extends Controller
{
    public function index(): View
    {
        $stats = $this->getAnalyticsData();

        return view('admin::analytics.index', compact('stats'));
    }

    private function getAnalyticsData(): array
    {
        $now = Carbon::now();

        return [
            'users' => [
                'total' => User::count(),
                'active' => User::where('is_active', true)->count(),
                'new_this_month' => User::whereMonth('created_at', $now->month)->count(),
                'new_this_week' => User::whereBetween('created_at', [$now->startOfWeek(), $now->endOfWeek()])->count(),
            ],
            'growth' => [
                'daily' => $this->getDailyGrowth(),
                'weekly' => $this->getWeeklyGrowth(),
                'monthly' => $this->getMonthlyGrowth(),
            ],
            'demographics' => [
                'roles' => User::selectRaw('roles.name, COUNT(*) as count')
                    ->join('model_has_roles', 'users.id', '=', 'model_has_roles.model_id')
                    ->join('roles', 'model_has_roles.role_id', '=', 'roles.id')
                    ->groupBy('roles.name')
                    ->pluck('count', 'name')
                    ->toArray(),
            ]
        ];
    }

    private function getDailyGrowth(): array
    {
        $days = collect();
        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $days->push([
                'date' => $date->format('M d'),
                'users' => User::whereDate('created_at', $date->toDateString())->count()
            ]);
        }
        return $days->toArray();
    }

    private function getWeeklyGrowth(): array
    {
        $weeks = collect();
        for ($i = 3; $i >= 0; $i--) {
            $startOfWeek = Carbon::now()->subWeeks($i)->startOfWeek();
            $endOfWeek = Carbon::now()->subWeeks($i)->endOfWeek();
            $weeks->push([
                'week' => 'Week ' . ($i + 1),
                'users' => User::whereBetween('created_at', [$startOfWeek, $endOfWeek])->count()
            ]);
        }
        return $weeks->toArray();
    }

    private function getMonthlyGrowth(): array
    {
        $months = collect();
        for ($i = 5; $i >= 0; $i--) {
            $date = Carbon::now()->subMonths($i);
            $months->push([
                'month' => $date->format('M Y'),
                'users' => User::whereYear('created_at', $date->year)
                    ->whereMonth('created_at', $date->month)
                    ->count()
            ]);
        }
        return $months->toArray();
    }
}