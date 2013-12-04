annotator
=========

Cloud aware annotation system

The protocol works a bit like this:

GET /annotation 
200 -> {version: "1.0", annotationUrl: "http://.../annotation}

POST /annotation
201 -> {annotationFilesUrl: "http://.../annotation/xxxx/files", annotationStatusUrl... }

POST /annotation/xxxx/files -- body is file data, with a MIME content type
202 -> 

GET /annotation/xxx/status
200 -> {annotationAvailable: true/false, ...}

GET /annotation/xxx/files/xxx -- return file data
200/404 -> data...

DELETE /annotation/xxxx -- when done
200


Notes: suggest MIME types for POST/GET data responses: 

application/x-variant-call-format
application/x-general-feature-format
application/json
text/xml

