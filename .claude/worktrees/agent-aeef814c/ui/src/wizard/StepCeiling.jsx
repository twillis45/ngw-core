import { useAppState, useDispatch } from '../context/AppContext';
import ChipSelect from '../components/ChipSelect';
import { CEILING_OPTIONS } from '../data/ceilingOptions';

export default function StepCeiling() {
  const { ceilingHeight } = useAppState();
  const dispatch = useDispatch();

  return (
    <>
      <h2 className="screen-heading">Ceiling height?</h2>
      <ChipSelect
        options={CEILING_OPTIONS}
        selected={ceilingHeight}
        onSelect={v => dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: v })}
      />
    </>
  );
}
