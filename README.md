annotator
=========

Cloud aware annotation system

The protocol works a bit like this:

POST /annotator
201 -> {url: "http://.../annotation/xxxx"}

POST /annotation/xxxx/data -- body is file data, with a MIME content type
202 -> 

GET /annotation/xxx/status
200 -> {annotationAvailable: true/false, ...}

GET /annotation/xxx/annotated-data -- Accept header specifies expected result type
200/404 -> data...

DELETE /annotation/xxxx -- when done
200


Notes: suggest MIME types for POST/GET data responses: 

application/x-variant-call-format
application/x-general-feature-format
application/json
text/xml

