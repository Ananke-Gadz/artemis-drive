import {addImmutable, updateImmutable, deleteImmutable, findInState} from '../helpers.js';
import Joi from 'joi';
import socketCluster from 'socketcluster-client';
import socketOptions from '../../utils/socketOptions';
import update from 'react/lib/update';

/*
 * Schema
 */
const idSchema = Joi.string().min(3).max(36);
export const noteSchemaUpdate = Joi.object({
  id: idSchema.required(),
  title: Joi.string().max(30).trim(),
  laneId: idSchema,
  userId: idSchema,
  index: Joi.number()
});
export const noteSchemaInsert = noteSchemaUpdate.requiredKeys('title', 'laneId', 'userId', 'index');

/*
 * Action types
 */
export const NOTES = 'notes'; //db table
export const NOTE = 'note'; //dnd
export const ADD_NOTE = 'ADD_NOTE';
export const UPDATE_NOTE = 'UPDATE_NOTE';
export const DELETE_NOTE = 'DELETE_NOTE';
const DRAG_NOTE = 'DRAG_NOTE';
const DROP_NOTE = 'DROP_NOTE';
const CLEAR_NOTES = 'CLEAR_NOTES'; //local state flush
const ADD_NOTE_SUCCESS = 'ADD_NOTE_SUCCESS';
const UPDATE_NOTE_SUCCESS = 'UPDATE_NOTE_SUCCESS';
const DELETE_NOTE_SUCCESS = 'DELETE_NOTE_SUCCESS';
const DROP_NOTE_SUCCESS = 'DROP_NOTE_SUCCESS';
const ADD_NOTE_ERROR = 'ADD_NOTE_ERROR';
const UPDATE_NOTE_ERROR = 'UPDATE_NOTE_ERROR';
const DELETE_NOTE_ERROR = 'DELETE_NOTE_ERROR';
const DROP_NOTE_ERROR = 'DROP_NOTE_ERROR';


/*
 * Reducer
 */
const initialState = {
  synced: false,
  error: null,
  data: []
};

export default function reducer(state = initialState, action = {}) {
  switch (action.type) {
    case ADD_NOTE:
      return Object.assign({}, state, {
        synced: action.meta && action.meta.synced || false,
        data: addImmutable(action.payload, state.data)
      });

    case UPDATE_NOTE:
      return Object.assign({}, state, {
        synced: action.meta && action.meta.synced || false,
        data: updateImmutable(action.payload, state.data)
      });

    case DELETE_NOTE:
      return Object.assign({}, state, {
        synced: action.meta && action.meta.synced || false,
        data: deleteImmutable(action.payload.id, state.data)
      });
    case CLEAR_NOTES:
      return Object.assign({}, initialState)
    case DRAG_NOTE:
      const {sourceId, targetLaneId, monitor} = action.payload;
      const newIndex = getNewIndex(state.data, action.payload);
      const updates = {
        index: newIndex,
        laneId: targetLaneId
      }
      //mutate the source props so we can drag on draggin on
      Object.assign(monitor.getItem(), updates)
      return Object.assign({}, state, {
        data: state.data.map(note =>
          note.id === sourceId ? Object.assign({}, note, updates) : note
        )
      });
    //const currentIndex = state.findIndex((note) => note.id === action.payload.noteId);
    //const movedNote = update(state[currentIndex], {laneId: {$set: action.payload.laneId}});
    //const newIndex = action.payload.laneIdx;
    //const newIndex = state.findIndex((note) => note.id === action.putAfterId);
    //return update(state, {
    //  $splice: [
    //    [currentIndex, 1],
    //    [newIndex, 0, movedNote]
    //[newIndex, 0, movedNote]
    //]
    //});
    case ADD_NOTE_SUCCESS:
    case UPDATE_NOTE_SUCCESS:
    case DELETE_NOTE_SUCCESS:
      return Object.assign({}, state, {
        synced: true,
        error: null
      });

    case ADD_NOTE_ERROR:
    case UPDATE_NOTE_ERROR:
    case DELETE_NOTE_ERROR:
      return Object.assign({}, state, {
        synced: true,
        error: action.error || 'Error'
      });

    default:
      return state;
  }
}

function getNewIndex(notes, payload) {
  //if the source is above the target, put it below, otherwise, put it above
  const {sourceId, sourceIndex, sourceLaneId, targetLaneId, targetIndex} = payload;
  let xfactor = 1;
  if ((targetLaneId === sourceLaneId && sourceIndex > targetIndex) || targetLaneId !== sourceLaneId) {
    xfactor = -1;
  }
  let minIndex = Infinity * xfactor;
  for (let i = 0; i < notes.length; i++) {
    let curNote = notes[i];
    if (curNote.id === sourceId) continue;
    if (xfactor * curNote.index > xfactor * targetIndex && xfactor * curNote.index < xfactor * minIndex) {
      minIndex = curNote.index
    }
  }
  return (minIndex === Infinity * xfactor) ? targetIndex + xfactor : (targetIndex + minIndex) / 2;
}

/*
 *Action creators
 */
const baseMeta = {
  table: NOTES,
  isOptimistic: true,
  synced: false
};

export function loadNotes() {
  const sub = 'allNotes';
  const socket = socketCluster.connect(socketOptions); //GOTCHA: must put it in the function otherwise server hangs up
  socket.subscribe(sub, {waitForAuth: true});
  return dispatch => {
    socket.on(sub, data => {
      const meta = {synced: true};
      if (!data.old_val) {
        dispatch(addNote(data.new_val, meta));
      } else if (!data.new_val) {
        dispatch(deleteNote(data.old_val.id, meta));
      } else {
        dispatch(updateNote(data.new_val, meta))
      }
    })
    socket.on('unsubscribe', channelName => {
      if (channelName === sub) {
        dispatch({type: CLEAR_NOTES});
      }
    })
  }
}

export function addNote(payload, meta) {
  return {
    type: ADD_NOTE,
    payload,
    meta: Object.assign({}, baseMeta, meta)
  }
}

export function updateNote(payload, meta) {
  return {
    type: UPDATE_NOTE,
    payload,
    meta: Object.assign({}, baseMeta, meta)
  };
}

export function deleteNote(payload, meta) {
  return {
    type: DELETE_NOTE,
    payload,
    meta: Object.assign({}, baseMeta, meta)
  };
}

export function dragNote(payload) {
  return {
    type: DRAG_NOTE,
    payload
  }
}

export const noteActions = {
  addNote,
  updateNote,
  deleteNote,
  dragNote
};
