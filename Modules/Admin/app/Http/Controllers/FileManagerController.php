<?php

namespace Modules\Admin\app\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\View\View;

class FileManagerController extends Controller
{
    public function index(): View
    {
        return view('admin::file-manager.index');
    }
}