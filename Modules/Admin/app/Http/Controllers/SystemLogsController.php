<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;

class SystemLogsController extends Controller
{
    public function index(): View
    {
        return view('admin::system-logs.index');
    }
}