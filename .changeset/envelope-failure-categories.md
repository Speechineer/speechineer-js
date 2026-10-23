---
'@speechineer/js': minor
---

Add four failure categories for the ways a request's *envelope* can be wrong, each with a class of its own: `SpeechineerMethodError` (405), `SpeechineerNotAcceptableError` (406), `SpeechineerTooLargeError` (413) and `SpeechineerUnsupportedMediaError` (415).

These were previously reported as `SpeechineerValidationError`, which said "your request is wrong" without saying that the body was too big, the content type unreadable, or the method simply not the one that endpoint takes — the four cases where nothing about the request's *content* is at fault. `error.code` is unchanged for all of them, so a `catch` that already branches on the code keeps working; only the class and the HTTP status are more specific.
