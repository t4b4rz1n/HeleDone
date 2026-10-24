"""
projects/urls.py
----------------
URL configuration for the projects app.
Uses drf-nested-routers for clean nested resource URLs:

    GET/POST     /api/v1/projects/
    GET/PUT/PATCH/DELETE  /api/v1/projects/<pk>/
    POST         /api/v1/projects/<pk>/archive/
    POST         /api/v1/projects/<pk>/complete/

    GET/POST     /api/v1/projects/<project_pk>/members/
    GET/PUT/PATCH/DELETE  /api/v1/projects/<project_pk>/members/<pk>/

    GET/POST     /api/v1/projects/<project_pk>/milestones/
    GET/PUT/PATCH/DELETE  /api/v1/projects/<project_pk>/milestones/<pk>/

    GET          /api/v1/projects/<project_pk>/activities/
    GET          /api/v1/projects/<project_pk>/activities/<pk>/
"""

from django.urls import include, path
from rest_framework_nested import routers

from .views import (
    MilestoneViewSet,
    ProjectActivityViewSet,
    ProjectFileViewSet,
    ProjectMemberViewSet,
    ProjectViewSet,
)

# Main router for top-level /projects/ resource
router = routers.DefaultRouter()
router.register(r"", ProjectViewSet, basename="project")

# Nested routers
projects_router = routers.NestedDefaultRouter(router, r"", lookup="project")

projects_router.register(r"members", ProjectMemberViewSet, basename="project-member")
projects_router.register(r"milestones", MilestoneViewSet, basename="project-milestone")
projects_router.register(r"activities", ProjectActivityViewSet, basename="project-activity")
projects_router.register(r"files", ProjectFileViewSet, basename="project-file")

# URLs ordering: manual/specific endpoints first, then routers at the end
urlpatterns = [
    # Router handles everything (including extra actions like /archive/ and /complete/ on ProjectViewSet)
    path("", include(router.urls)),
    path("", include(projects_router.urls)),
]
