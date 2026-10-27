"""Public URLs for uploaded files in API responses."""


def file_url(file, request=None):
    if not file:
        return None
    try:
        url = file.url
    except ValueError:
        return None
    return request.build_absolute_uri(url) if request is not None else url
