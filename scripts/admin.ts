// Description:
//   A collection of utilities to get information related to flowdock usage.
//
// Configuration:
//   HUBOT_FLOWDOCK_API_TOKEN
//
// Commands:
//   hubot reconnect <optional reason for reconnecting> - reconnects to the flowdock stream
//   hubot users [flowdock|robot] - responds with a list of Flowdock users as User Name: user-id
//
// Author:
//   shadowfiend
//   kb0rg

import { Robot } from "hubot"
import { MatrixEvent, EventType, RoomMemberEvent } from "matrix-js-sdk"
import * as hubot from "hubot"
import { isMatrixAdapter } from "../lib/adapter-util"

const SUPER_ADMIN_USERS = ["@matt:thesis.co", "@shadowfiend:thesis.co"]

const ADMIN_USERS = [
  ...SUPER_ADMIN_USERS,
  "@puppycodes:thesis.co",
  "@carolyn:thesis.co",
  "@gluzman:thesis.co",
  "@jessiefrance:thesis.co",
  "@veronica:thesis.co",
]

// Additional per-space admins beyond the core Thesis admins.
const SPACE_ADMINS: { [spaceRoomId: string]: string[] } = {
  // Thesis* space.
  "!outFXRZStxHJasvWKL:thesis.co": [],
  // Keep space.
  "!YDpOcIsEpQabwiHpdV:thesis.co": [
    "@dougvk:thesis.co",
    "@piotr.dyraga:thesis.co",
  ],
  // Tally Ho space.
  "!wCfAwzfZOUHTYIDjRn:thesis.co": [
    "@michaelh:thesis.co",
    "@puppycodes:thesis.co",
  ],
  // Fold space.
  "!fold:thesis.co": ["@michaelh:thesis.co", "@puppycodes:thesis.co"],
  // Power Period space.
  "!XEnwlDoWvSBvrloDVH:thesis.co": ["@anna:thesis.co"],
}

module.exports = (robot: Robot<any>) => {
  robot.respond(/users/i, (response) => {
    response.reply(
      `\n${Object.values(robot.brain.users())
        .map((user) => ` - ${user.name}: ${user.id}`)
        .join("\n")}`,
    )
  })

  if (isMatrixAdapter(robot.adapter)) {
    const { adapter } = robot
    const { client } = adapter
    if (client === undefined || client.getUserId() === null) {
      return
    }

    const userId = client.getUserId()
    if (userId === null) {
      return
    }

    robot.respond(/relinquish admin/i, (response) => {
      if (SUPER_ADMIN_USERS.includes(response.envelope.user.id)) {
        const existingLevels = client
          .getRoom(response.envelope.room)
          ?.currentState.getStateEvents(EventType.RoomPowerLevels)
          ?.at(0)

        if (existingLevels === undefined) {
          response.reply(
            "Failed to relinquish admin; unable to look up existing power levels.",
          )
        } else {
          response.reply(
            "Roger, setting you to admin and relinquishing admin...",
          )

          const existingContent = existingLevels.getContent()
          client.setPowerLevel(
            response.envelope.room,
            response.envelope.user.id,
            100,
            new MatrixEvent({
              ...existingLevels.event,
              content: {
                ...existingContent,
                users: {
                  ...existingContent.users,
                  [userId]: 0,
                },
              },
            }),
          )
        }
      } else {
        response.reply("Sorry, you can't make me relinquish admin!")
      }
    })

    const hubotUser = new hubot.User(userId)
    const envelopeForRoom = (roomId: string) => ({
      user: hubotUser,
      room: roomId,
      message: new hubot.Message(hubotUser),
    })

    client.on(RoomMemberEvent.PowerLevel, async (event, member) => {
      const roomId = event.getRoomId()
      if (roomId === undefined) {
        return
      }

      const room = client.getRoom(roomId)
      if (room === null) {
        return
      }
      /*
         Event to set full join across hierarchy:

        {
          "content": {
            "allow": [
              {
                "room_id": "!VRGYJeUwuhkMmZPcpX:thesis.co",
                "type": "m.room_membership"
              },
              {
                "room_id": "!outFXRZStxHJasvWKL:thesis.co",
                "type": "m.room_membership"
              }
            ],
            "join_rule": "restricted"
          },
          "origin_server_ts": 1666321627230,
          "sender": "@shadowfiend:thesis.co",
          "state_key": "",
          "type": "m.room.join_rules",
          "unsigned": {
            "replaces_state": "$tllXoJSLMb6TeRILvTFfm4-oGEhZcg8vjlcWIX65hf4",
            "prev_content": {
              "allow": [
                {
                  "room_id": "!VRGYJeUwuhkMmZPcpX:thesis.co",
                  "type": "m.room_membership"
                }
              ],
              "join_rule": "restricted"
            },
            "prev_sender": "@matt:thesis.co",
            "age": 164
          },
          "event_id": "$V44XsTkvXTOT-_BP1RoAZPNUOydtZiXnyQ_xKCSRXxw",
          "room_id": "!rWLGMyTmMPeePdBwHb:thesis.co"
        }
*/

      if (
        member.userId === client.getUserId() &&
        member.powerLevel === 100 &&
        roomId !== undefined
      ) {
        const parentRoomIds = []
        let currentParents = room.currentState.getStateEvents(
          EventType.SpaceParent,
        )
        while (
          currentParents.length > 0 &&
          currentParents[0].event.state_key !== undefined
        ) {
          const parentId = currentParents[0].event.state_key
          parentRoomIds.push(parentId)
          currentParents =
            client
              .getRoom(parentId)
              ?.currentState.getStateEvents(EventType.SpaceParent) ?? []
        }

        const admins = ADMIN_USERS.concat(
          parentRoomIds.flatMap(
            (parentRoomId) => SPACE_ADMINS[parentRoomId] ?? [],
          ),
        )

        const existingAlias = room.getCanonicalAlias()

        // TODO How do we handle cases where multiple spaces have the same room
        // TODO name? Should all non-Thesis level rooms have their containing
        // TODO space prefixed?
        if (existingAlias === null) {
          client.sendEvent(roomId, EventType.RoomCanonicalAlias, {
            alias: `#${room.name
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "-")}:${client.getDomain()}`,
          })
        }

        adapter.send(
          envelopeForRoom(roomId),
          `
          I took over admin privileges! This means the admin power level is now
          95, Thesis-wide admins have that power level, as do Space-specific
          admins. adminbot and I will remain at 100 so we can make any future
          updates.

          I'm also making sure there's a user-friendly alias for this room across
          chat.thesis.co.
        `.replace(/^\s+/gm, ""),
        )

        const adminPowerLevels = Object.fromEntries(
          admins.map((adminUserId) => [adminUserId, 95] as const),
        )
        const existingContent = event.getContent()
        client.setPowerLevel(
          roomId,
          userId,
          100,
          new MatrixEvent({
            ...event.event,
            content: {
              ...existingContent,
              users: {
                ...existingContent.users,
                ...adminPowerLevels,
              },
            },
          }),
        )
      }
    })
  }
}
