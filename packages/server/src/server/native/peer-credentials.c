#include <node_api.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <fcntl.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

static napi_value read_peer(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], value; int32_t fd;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok || fd < 0) {
    napi_throw_error(env, NULL, "Invalid socket descriptor"); return NULL;
  }
  struct sockaddr_storage address; socklen_t length = sizeof(address);
  uid_t uid; gid_t gid;
  if (getpeername(fd, (struct sockaddr *)&address, &length) != 0 ||
      address.ss_family != AF_UNIX || getpeereid(fd, &uid, &gid) != 0) {
    napi_throw_error(env, NULL, "Unix peer credentials unavailable"); return NULL;
  }
  napi_create_uint32(env, uid, &value); return value;
}
static napi_value create_listener(napi_env env, napi_callback_info info) {
  size_t count = 1, length; napi_value args[1], value; struct sockaddr_un address;
  memset(&address, 0, sizeof(address)); address.sun_family = AF_UNIX;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_string_utf8(env, args[0], address.sun_path, sizeof(address.sun_path), &length) != napi_ok || length == 0 || length >= sizeof(address.sun_path) - 1 || length != strlen(address.sun_path)) {
    napi_throw_error(env, NULL, "Invalid Unix path"); return NULL;
  }
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0 || fcntl(fd, F_SETFD, FD_CLOEXEC) != 0 || bind(fd, (struct sockaddr *)&address, sizeof(address)) != 0) {
    if (fd >= 0) close(fd); napi_throw_error(env, NULL, "Unix socket bind unavailable"); return NULL;
  }
  // Node adopts an FD without a pathname, so libuv cannot unlink another
  // process's replacement endpoint on close. JS owns inode-checked cleanup.
  napi_create_int32(env, fd, &value); return value;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn; napi_create_function(env, "peerUid", NAPI_AUTO_LENGTH, read_peer, NULL, &fn);
  napi_set_named_property(env, exports, "peerUid", fn);
  napi_create_function(env, "createListener", NAPI_AUTO_LENGTH, create_listener, NULL, &fn);
  napi_set_named_property(env, exports, "createListener", fn); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
