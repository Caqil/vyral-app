<x-admin::layouts.master>
    @section('title', 'Admin')
    @section('breadcrumbs')
        <li>Admin Home</li>
    @endsection

    <div class="dashboard-card">
        <div class="card-body">
            <h1 class="text-2xl font-bold">Welcome to Admin Module</h1>
            <p class="mt-2 text-base-content/70">Module: {!! config('admin.name', 'Admin') !!}</p>

            <div class="mt-6">
                <a href="{{ route('admin.dashboard') }}" class="btn btn-primary">Go to Dashboard</a>
            </div>
        </div>
    </div>
</x-admin::layouts.master>